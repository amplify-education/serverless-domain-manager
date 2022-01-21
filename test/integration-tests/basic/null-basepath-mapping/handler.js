"use strict";

module.exports.helloWorld = (event, context, callback) => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
    },
    body: JSON.stringify({
      message: "Go Serverless! Your function executed successfully!",
      input: event,
    }),
  };

  callback(null, response);
};
