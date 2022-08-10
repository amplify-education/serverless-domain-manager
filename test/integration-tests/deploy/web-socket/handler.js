"use strict";

module.exports.connect = (_event, _context, callback) => {
  const response = {
    statusCode: 200,
  };

  callback(null, response);
};
