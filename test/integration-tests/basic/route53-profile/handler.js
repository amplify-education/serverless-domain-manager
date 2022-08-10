"use strict";

module.exports.helloWorld = (event, _context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: "Go Serverless! Your function executed successfully!",
      input: event,
    }),
  };

  callback(null, response);
};
