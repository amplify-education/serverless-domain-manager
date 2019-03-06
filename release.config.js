/* eslint-disable no-useless-escape */
/**
 * Config file for Semantic Release
 * @type {Object}
 */
module.exports = {
  preset: "metahub",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/github",
    "@semantic-release/git",
  ],
  analyzeCommits: {
    releaseRules: "conventional-changelog-metahub/release-rules",
    noteKeywords: [
      "BREAKING CHANGE",
      "BREAKING CHANGES",
      "BREAKING",
    ],
  //  },
  },
  generateNotes: {
    noteKeywords: [
      "BREAKING CHANGE",
      "BREAKING CHANGES",
      "BREAKING",
    ],
  //  },
  },
};
