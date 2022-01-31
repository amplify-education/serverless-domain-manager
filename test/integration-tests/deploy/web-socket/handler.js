"use strict";

module.exports.connect = (event, context, callback) => {
  const response = {
    statusCode: 200,
  };

  callback(null, response);
};
