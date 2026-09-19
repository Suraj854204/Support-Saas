module.exports = {
  root: true,
  extends: ["../../packages/config/eslint/base.js"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};
