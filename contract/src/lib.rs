#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAMember = 3,
    Unauthorized = 4,
    InvalidDeadline = 5,
    ProposalNotFound = 6,
    VotingClosed = 7,
    AlreadyVoted = 8,
    InvalidStatus = 9,
    NotATreasurer = 10,
    DeadlineNotReached = 11,
    TimelockActive = 12,
    SubCategoriesLocked = 13,
    SubCategoriesNotSet = 14,
    AmountMismatch = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Proposal(u32),       // proposal_id -> Proposal
    Vote(u32, Address),  // (proposal_id, voter_address) -> VoteChoice
    Reputation(Address), // address -> u32
    Member(Address),     // address -> bool
    Treasurer(Address),  // address -> bool
    Config,              // -> ContractConfig
    SubCategories(u32),  // proposal_id -> Vec<SubCategory>
    TreasuryBalance,     // -> i128
    LastProposalId,      // -> u32
    Whitelist,           // -> Vec<Address>
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Rejected,
    PendingExecution,
    Executed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    Approve,
    Reject,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub amount: i128,
    pub title: String,
    pub description: String,
    pub receipt_url: String,
    pub voting_deadline: u64,
    pub approved_at: Option<u64>,
    pub status: ProposalStatus,
    pub yes_votes: u32,
    pub no_votes: u32,
    pub is_high_budget: bool,
    pub sub_categories_locked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubCategory {
    pub name: String,
    pub amount: i128,
    pub withdrawn: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractConfig {
    pub admin: Address,
    pub treasurer: Address,
    pub token_address: Address,
    pub time_lock_seconds: u64,
    pub member_count: u32,
    pub budget_threshold: i128,
}

#[contract]
pub struct StellarTreasuryContract;

#[contractimpl]
impl StellarTreasuryContract {
    /// Initialize the contract with core configuration and whitelist.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasurer: Address,
        token_address: Address,
        time_lock_seconds: u64,
        budget_threshold_usdc: i128,
        member_whitelist: Vec<Address>,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(ContractError::AlreadyInitialized);
        }

        let config = ContractConfig {
            admin: admin.clone(),
            treasurer: treasurer.clone(),
            token_address,
            time_lock_seconds,
            member_count: member_whitelist.len(),
            budget_threshold: budget_threshold_usdc,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::TreasuryBalance, &0i128);
        env.storage().instance().set(&DataKey::LastProposalId, &0u32);
        env.storage().persistent().set(&DataKey::Whitelist, &member_whitelist);

        // Register Treasurer
        env.storage().persistent().set(&DataKey::Treasurer(treasurer.clone()), &true);
        
        for member in member_whitelist.iter() {
            env.storage().persistent().set(&DataKey::Member(member.clone()), &true);
            // Initialize reputation to 0 if not already present
            if !env.storage().persistent().has(&DataKey::Reputation(member.clone())) {
                env.storage().persistent().set(&DataKey::Reputation(member), &0u32);
            }
        }

        env.events().publish(
            (symbol_short!("TREASURY"), symbol_short!("INIT")),
            (admin, treasurer, member_whitelist),
        );

        Ok(())
    }

    /// Deposit tokens into the treasury. Only whitelisted members can deposit.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), ContractError> {
        from.require_auth();

        if !env.storage().persistent().has(&DataKey::Member(from.clone())) {
            return Err(ContractError::NotAMember);
        }

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        let token_client = token::Client::new(&env, &config.token_address);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        let mut balance: i128 = env.storage().instance().get(&DataKey::TreasuryBalance).unwrap_or(0);
        balance += amount;
        env.storage().instance().set(&DataKey::TreasuryBalance, &balance);

        env.events().publish(
            (symbol_short!("TREASURY"), symbol_short!("DEPOSIT")),
            (from, amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Create a new spending proposal. Only whitelisted members can propose.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        amount: i128,
        title: String,
        description: String,
        receipt_url: String,
        voting_deadline: u64,
    ) -> Result<u32, ContractError> {
        proposer.require_auth();

        if !env.storage().persistent().has(&DataKey::Member(proposer.clone())) {
            return Err(ContractError::NotAMember);
        }

        if voting_deadline <= env.ledger().timestamp() {
            return Err(ContractError::InvalidDeadline);
        }

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        let mut proposal_id: u32 = env.storage().instance().get(&DataKey::LastProposalId).unwrap_or(0);
        proposal_id += 1;
        env.storage().instance().set(&DataKey::LastProposalId, &proposal_id);

        let is_high_budget = amount >= config.budget_threshold;

        let proposal = Proposal {
            id: proposal_id,
            proposer: proposer.clone(),
            amount,
            title: title.clone(),
            description: description.clone(),
            receipt_url: receipt_url.clone(),
            voting_deadline,
            approved_at: None,
            status: ProposalStatus::Active,
            yes_votes: 0,
            no_votes: 0,
            is_high_budget,
            sub_categories_locked: false,
        };

        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (symbol_short!("PROPOSAL"), symbol_short!("CREATED")),
            (
                proposal_id,
                proposer,
                amount,
                title,
                voting_deadline,
                is_high_budget,
            ),
        );

        Ok(proposal_id)
    }

    /// Cast a vote on an active proposal.
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u32,
        choice: VoteChoice,
    ) -> Result<(), ContractError> {
        voter.require_auth();

        if !env.storage().persistent().has(&DataKey::Member(voter.clone())) {
            return Err(ContractError::NotAMember);
        }

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Active {
            return Err(ContractError::InvalidStatus);
        }

        if env.ledger().timestamp() >= proposal.voting_deadline {
            return Err(ContractError::VotingClosed);
        }

        if env.storage().persistent().has(&DataKey::Vote(proposal_id, voter.clone())) {
            return Err(ContractError::AlreadyVoted);
        }

        match choice {
            VoteChoice::Approve => proposal.yes_votes += 1,
            VoteChoice::Reject => proposal.no_votes += 1,
        }

        env.storage().persistent().set(&DataKey::Vote(proposal_id, voter.clone()), &choice);
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (symbol_short!("PROPOSAL"), symbol_short!("VOTE")),
            (proposal_id, voter, choice, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Finalize the voting process after the deadline has passed.
    pub fn finalize_voting(env: Env, proposal_id: u32) -> Result<(), ContractError> {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Active {
            return Err(ContractError::InvalidStatus);
        }

        if env.ledger().timestamp() < proposal.voting_deadline {
            return Err(ContractError::DeadlineNotReached);
        }

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        // Check for > 2/3 majority: yes_votes * 3 > member_count * 2
        if proposal.yes_votes * 3 > config.member_count * 2 {
            proposal.status = ProposalStatus::PendingExecution;
            proposal.approved_at = Some(env.ledger().timestamp());

            env.events().publish(
                (symbol_short!("PROPOSAL"), symbol_short!("APPROVED")),
                (proposal_id, proposal.yes_votes, env.ledger().timestamp()),
            );
        } else {
            proposal.status = ProposalStatus::Rejected;

            env.events().publish(
                (symbol_short!("PROPOSAL"), symbol_short!("REJECTED")),
                (proposal_id, proposal.yes_votes, env.ledger().timestamp()),
            );
        }

        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        Ok(())
    }

    /// Execute a withdrawal for an approved proposal.
    pub fn execute_withdrawal(
        env: Env,
        treasurer: Address,
        proposal_id: u32,
        sub_category_index: u32,
    ) -> Result<(), ContractError> {
        treasurer.require_auth();

        if !env.storage().persistent().has(&DataKey::Treasurer(treasurer.clone())) {
            return Err(ContractError::NotATreasurer);
        }

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::PendingExecution {
            return Err(ContractError::InvalidStatus);
        }

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        let approved_at = proposal.approved_at.unwrap_or(0);
        if env.ledger().timestamp() < approved_at + config.time_lock_seconds {
            return Err(ContractError::TimelockActive);
        }

        let token_client = token::Client::new(&env, &config.token_address);

        if !proposal.is_high_budget {
            token_client.transfer(
                &env.current_contract_address(),
                &proposal.proposer,
                &proposal.amount,
            );

            proposal.status = ProposalStatus::Executed;
            env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

            let mut balance: i128 = env
                .storage()
                .instance()
                .get(&DataKey::TreasuryBalance)
                .unwrap_or(0);
            balance -= proposal.amount;
            env.storage().instance().set(&DataKey::TreasuryBalance, &balance);

            env.events().publish(
                (symbol_short!("TREASURY"), symbol_short!("WITHDRAW")),
                (proposal_id, proposal.proposer.clone(), proposal.amount),
            );
        } else {
            if !proposal.sub_categories_locked {
                return Err(ContractError::SubCategoriesNotSet);
            }

            let mut sub_categories: Vec<SubCategory> = env
                .storage()
                .persistent()
                .get(&DataKey::SubCategories(proposal_id))
                .unwrap_or(Vec::new(&env));

            let mut cat = sub_categories
                .get(sub_category_index)
                .ok_or(ContractError::InvalidStatus)?;
            if cat.withdrawn {
                return Err(ContractError::InvalidStatus); // Already withdrawn
            }

            token_client.transfer(&env.current_contract_address(), &proposal.proposer, &cat.amount);

            cat.withdrawn = true;
            sub_categories.set(sub_category_index, cat.clone());

            let mut balance: i128 = env
                .storage()
                .instance()
                .get(&DataKey::TreasuryBalance)
                .unwrap_or(0);
            balance -= cat.amount;
            env.storage().instance().set(&DataKey::TreasuryBalance, &balance);

            env.events().publish(
                (symbol_short!("TREASURY"), symbol_short!("PHASE_WD")),
                (proposal_id, cat.name, cat.amount),
            );

            // Check if all sub-categories are withdrawn
            let mut all_done = true;
            for cat in sub_categories.iter() {
                if !cat.withdrawn {
                    all_done = false;
                    break;
                }
            }

            if all_done {
                proposal.status = ProposalStatus::Executed;
            }

            env.storage()
                .persistent()
                .set(&DataKey::Proposal(proposal_id), &proposal);
            env.storage()
                .persistent()
                .set(&DataKey::SubCategories(proposal_id), &sub_categories);
        }

        Ok(())
    }

    /// Admin submits sub-categories for a high-budget proposal.
    pub fn set_sub_categories(
        env: Env,
        admin: Address,
        proposal_id: u32,
        categories: Vec<SubCategory>,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        if admin != config.admin {
            return Err(ContractError::Unauthorized);
        }

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::PendingExecution {
            return Err(ContractError::InvalidStatus);
        }

        if !proposal.is_high_budget {
            return Err(ContractError::InvalidStatus);
        }

        if proposal.sub_categories_locked {
            return Err(ContractError::SubCategoriesLocked);
        }

        // Validate total amount
        let mut total: i128 = 0;
        for cat in categories.iter() {
            total += cat.amount;
        }

        if total != proposal.amount {
            return Err(ContractError::AmountMismatch);
        }

        proposal.sub_categories_locked = true;

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage()
            .persistent()
            .set(&DataKey::SubCategories(proposal_id), &categories);

        env.events().publish(
            (symbol_short!("PROPOSAL"), symbol_short!("CATS_SET")),
            (proposal_id, categories.clone()),
        );

        Ok(())
    }

    /// Admin adds a new member to the whitelist.
    pub fn add_member(
        env: Env,
        admin: Address,
        new_member: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let mut config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        if admin != config.admin {
            return Err(ContractError::Unauthorized);
        }

        if env.storage().persistent().has(&DataKey::Member(new_member.clone())) {
            return Ok(()); // Already a member
        }

        env.storage().persistent().set(&DataKey::Member(new_member.clone()), &true);
        
        // Update Whitelist Vec
        let mut whitelist: Vec<Address> = env.storage().persistent().get(&DataKey::Whitelist).unwrap_or(Vec::new(&env));
        whitelist.push_back(new_member.clone());
        env.storage().persistent().set(&DataKey::Whitelist, &whitelist);

        // Initialize reputation if not present
        if !env.storage().persistent().has(&DataKey::Reputation(new_member.clone())) {
            env.storage().persistent().set(&DataKey::Reputation(new_member.clone()), &0u32);
        }

        config.member_count += 1;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("MEMBER"), symbol_short!("ADDED")),
            (new_member,),
        );

        Ok(())
    }

    /// Admin transfers administration privileges to a new address.
    pub fn transfer_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        current_admin.require_auth();

        let mut config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        if current_admin != config.admin {
            return Err(ContractError::Unauthorized);
        }

        config.admin = new_admin.clone();
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("ADMIN"), symbol_short!("TRANSFER")),
            (current_admin, new_admin),
        );

        Ok(())
    }

    /// Admin removes a member from the whitelist.
    pub fn remove_member(
        env: Env,
        admin: Address,
        member: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let mut config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        if admin != config.admin {
            return Err(ContractError::Unauthorized);
        }

        if !env.storage().persistent().has(&DataKey::Member(member.clone())) {
            return Ok(()); // Not a member
        }

        env.storage().persistent().remove(&DataKey::Member(member.clone()));
        
        // Update Whitelist Vec
        let mut whitelist: Vec<Address> = env.storage().persistent().get(&DataKey::Whitelist).unwrap_or(Vec::new(&env));
        let index = whitelist.first_index_of(&member);
        if let Some(i) = index {
            whitelist.remove(i);
        }
        env.storage().persistent().set(&DataKey::Whitelist, &whitelist);

        if config.member_count > 0 {
            config.member_count -= 1;
        }
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("MEMBER"), symbol_short!("REMOVED")),
            (member,),
        );

        Ok(())
    }

    /// Admin confirms completion of a task to award reputation.
    pub fn confirm_completion(
        env: Env,
        admin: Address,
        proposal_id: u32,
        sub_category_index: Option<u32>,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let config: ContractConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(ContractError::NotInitialized)?;

        if admin != config.admin {
            return Err(ContractError::Unauthorized);
        }

        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(ContractError::ProposalNotFound)?;

        if !proposal.is_high_budget {
            if proposal.status != ProposalStatus::Executed {
                return Err(ContractError::InvalidStatus);
            }
        } else {
            let idx = sub_category_index.ok_or(ContractError::InvalidStatus)?;
            let sub_categories: Vec<SubCategory> = env
                .storage()
                .persistent()
                .get(&DataKey::SubCategories(proposal_id))
                .ok_or(ContractError::ProposalNotFound)?;

            let cat = sub_categories.get(idx).ok_or(ContractError::InvalidStatus)?;
            if !cat.withdrawn {
                return Err(ContractError::InvalidStatus);
            }
        }

        let mut reputation: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(proposal.proposer.clone()))
            .unwrap_or(0);

        reputation += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Reputation(proposal.proposer.clone()), &reputation);

        env.events().publish(
            (Symbol::new(&env, "REPUTATION"), symbol_short!("UPDATE")),
            (proposal.proposer, reputation),
        );

        Ok(())
    }

    // --- Query Functions ---

    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        env.storage().persistent().get(&DataKey::Proposal(proposal_id))
    }

    pub fn get_all_proposals(env: Env) -> Vec<Proposal> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LastProposalId)
            .unwrap_or(0);
        let mut proposals = Vec::new(&env);
        for i in 1..=count {
            if let Some(p) = env.storage().persistent().get(&DataKey::Proposal(i)) {
                proposals.push_back(p);
            }
        }
        proposals
    }

    pub fn get_member_reputation(env: Env, member: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation(member))
            .unwrap_or(0)
    }

    pub fn get_config(env: Env) -> Option<ContractConfig> {
        env.storage().instance().get(&DataKey::Config)
    }

    pub fn get_whitelist(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Whitelist)
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_sub_categories(env: Env, proposal_id: u32) -> Vec<SubCategory> {
        env.storage()
            .persistent()
            .get(&DataKey::SubCategories(proposal_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_treasury_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TreasuryBalance)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{token, Env};

    fn setup_test(
        env: &Env,
    ) -> (
        Address,
        Address,
        Address,
        Vec<Address>,
        Address,
        StellarTreasuryContractClient<'_>,
    ) {
        let admin = Address::generate(env);
        let treasurer = Address::generate(env);
        let member_1 = Address::generate(env);
        let member_2 = Address::generate(env);
        let member_3 = Address::generate(env);
        let whitelist = Vec::from_array(env, [member_1.clone(), member_2.clone(), member_3.clone()]);

        let token_admin = Address::generate(env);
        let token_address = env.register_stellar_asset_contract(token_admin.clone());

        let contract_id = env.register_contract(None, StellarTreasuryContract);
        let client = StellarTreasuryContractClient::new(env, &contract_id);

        client.initialize(
            &admin,
            &treasurer,
            &token_address,
            &60, // 1 minute timelock
            &5_000_000,
            &whitelist,
        );

        (
            admin,
            treasurer,
            token_address,
            whitelist,
            contract_id,
            client,
        )
    }

    #[test]
    fn test_initialize_and_deposit() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, _treasurer, token_address, whitelist, contract_id, client) = setup_test(&env);
        let member_1 = whitelist.get(0).unwrap();

        let token_client = token::StellarAssetClient::new(&env, &token_address);
        let token_query = token::Client::new(&env, &token_address);

        token_client.mint(&member_1, &100_000_000);
        client.deposit(&member_1, &50_000_000);

        assert_eq!(client.get_treasury_balance(), 50_000_000);
        assert_eq!(token_query.balance(&contract_id), 50_000_000);
    }

    #[test]
    fn test_create_proposal_and_vote() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, _treasurer, _token_address, whitelist, _contract_id, client) =
            setup_test(&env);
        let member_1 = whitelist.get(0).unwrap();
        let member_2 = whitelist.get(1).unwrap();

        let deadline = env.ledger().timestamp() + 1000;
        let proposal_id = client.create_proposal(
            &member_1,
            &1_000_000,
            &String::from_str(&env, "Title"),
            &String::from_str(&env, "Description"),
            &String::from_str(&env, "https://receipt.url"),
            &deadline,
        );

        assert_eq!(proposal_id, 1);

        client.vote(&member_1, &proposal_id, &VoteChoice::Approve);
        client.vote(&member_2, &proposal_id, &VoteChoice::Reject);

        let proposal = client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.yes_votes, 1);
        assert_eq!(proposal.no_votes, 1);
    }

    #[test]
    fn test_finalize_and_execute_low_budget() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, treasurer, token_address, whitelist, _contract_id, client) = setup_test(&env);
        let member_1 = whitelist.get(0).unwrap();
        let member_2 = whitelist.get(1).unwrap();
        let member_3 = whitelist.get(2).unwrap();

        // 1. Deposit
        let token_client = token::StellarAssetClient::new(&env, &token_address);
        token_client.mint(&member_1, &10_000_000);
        client.deposit(&member_1, &10_000_000);

        // 2. Create Proposal
        let deadline = env.ledger().timestamp() + 1000;
        let proposal_id = client.create_proposal(
            &member_1,
            &3_000_000,
            &String::from_str(&env, "Lunch"),
            &String::from_str(&env, "Pizza for members"),
            &String::from_str(&env, "https://pizza.com/rec"),
            &deadline,
        );

        // 3. Vote (> 2/3: 3 members -> needs 3 votes)
        // Wait, > 2/3 of 3 is 2. So 3 votes needed (3*3 > 3*2 is 9 > 6).
        // If 2 votes: 2*3 > 3*2 is 6 > 6 (False).
        // So with 3 members, we need 3 YES votes for supermajority (> 2/3).
        client.vote(&member_1, &proposal_id, &VoteChoice::Approve);
        client.vote(&member_2, &proposal_id, &VoteChoice::Approve);
        client.vote(&member_3, &proposal_id, &VoteChoice::Approve);

        // 4. Finalize after deadline
        env.ledger().set_timestamp(deadline + 1);
        client.finalize_voting(&proposal_id);

        let proposal = client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.status, ProposalStatus::PendingExecution);

        // 5. Execute after time-lock (60s)
        env.ledger().set_timestamp(deadline + 1 + 61);
        client.execute_withdrawal(&treasurer, &proposal_id, &0);

        let proposal_after = client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal_after.status, ProposalStatus::Executed);

        let token_query = token::Client::new(&env, &token_address);
        assert_eq!(token_query.balance(&member_1), 3_000_000);
    }

    #[test]
    fn test_high_budget_workflow() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, treasurer, token_address, whitelist, _contract_id, client) = setup_test(&env);
        let member_1 = whitelist.get(0).unwrap();
        let member_2 = whitelist.get(1).unwrap();
        let member_3 = whitelist.get(2).unwrap();

        // 1. Deposit
        let token_client = token::StellarAssetClient::new(&env, &token_address);
        token_client.mint(&member_1, &20_000_000);
        client.deposit(&member_1, &20_000_000);

        // 2. Create High Budget Proposal (>= 5,000_000)
        let deadline = env.ledger().timestamp() + 1000;
        let proposal_id = client.create_proposal(
            &member_1,
            &10_000_000,
            &String::from_str(&env, "Event"),
            &String::from_str(&env, "Large event"),
            &String::from_str(&env, "https://event.com/rec"),
            &deadline,
        );

        // 3. Vote and Finalize
        client.vote(&member_1, &proposal_id, &VoteChoice::Approve);
        client.vote(&member_2, &proposal_id, &VoteChoice::Approve);
        client.vote(&member_3, &proposal_id, &VoteChoice::Approve);
        env.ledger().set_timestamp(deadline + 1);
        client.finalize_voting(&proposal_id);

        // 4. Admin sets sub-categories
        let categories = Vec::from_array(
            &env,
            [
                SubCategory {
                    name: String::from_str(&env, "Phase 1"),
                    amount: 6_000_000,
                    withdrawn: false,
                },
                SubCategory {
                    name: String::from_str(&env, "Phase 2"),
                    amount: 4_000_000,
                    withdrawn: false,
                },
            ],
        );
        client.set_sub_categories(&admin, &proposal_id, &categories);

        // 5. Execute Phase 1
        env.ledger().set_timestamp(deadline + 1 + 61);
        client.execute_withdrawal(&treasurer, &proposal_id, &0);

        // Confirm completion -> reputation
        assert_eq!(client.get_member_reputation(&member_1), 0);
        client.confirm_completion(&admin, &proposal_id, &Some(0));
        assert_eq!(client.get_member_reputation(&member_1), 1);

        // 6. Execute Phase 2
        client.execute_withdrawal(&treasurer, &proposal_id, &1);
        client.confirm_completion(&admin, &proposal_id, &Some(1));
        assert_eq!(client.get_member_reputation(&member_1), 2);

        let proposal = client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.status, ProposalStatus::Executed);
    }

    #[test]
    fn test_whitelist_management() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, _treasurer, _token_address, whitelist, _contract_id, client) = setup_test(&env);

        // Check initial whitelist (from setup_test: member_1, member_2, member_3)
        let current_whitelist = client.get_whitelist();
        assert_eq!(current_whitelist.len(), 3);
        
        // Add a new member
        let new_member = Address::generate(&env);
        client.add_member(&admin, &new_member);
        
        let updated_whitelist = client.get_whitelist();
        assert_eq!(updated_whitelist.len(), 4);
        assert!(updated_whitelist.contains(new_member.clone()));
        
        let config = client.get_config().unwrap();
        assert_eq!(config.member_count, 4);

        // Remove a member
        let member_to_remove = whitelist.get(0).unwrap();
        client.remove_member(&admin, &member_to_remove);
        
        let final_whitelist = client.get_whitelist();
        assert_eq!(final_whitelist.len(), 3);
        assert!(!final_whitelist.contains(member_to_remove));
        
        let final_config = client.get_config().unwrap();
        assert_eq!(final_config.member_count, 3);
    }
}
