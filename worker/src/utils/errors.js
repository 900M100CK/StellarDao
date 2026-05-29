/**
 * Custom error classes for the worker.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class EventParsingError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.details = details;
  }
}

class DatabaseUpdateError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500);
    this.originalError = originalError;
  }
}

class SyncError extends AppError {
  constructor(message) {
    super(message, 500);
  }
}

module.exports = {
  AppError,
  EventParsingError,
  DatabaseUpdateError,
  SyncError
};
