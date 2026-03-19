module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation only changes
        "style", // Changes that don't affect code (formatting, etc)
        "refactor", // Code change that neither fixes nor adds feature
        "perf", // Performance improvement
        "test", // Adding or correcting tests
        "build", // Build system or dependencies
        "ci", // CI configuration changes
        "chore", // Other changes that don't modify src or test files
        "revert", // Revert a previous commit
        "feat!", // Breaking change in a feature
        "fix!" // Breaking change in a fix
      ]
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100]
  }
};
