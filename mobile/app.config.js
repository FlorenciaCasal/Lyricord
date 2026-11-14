const IS_QA = process.env.APP_VARIANT === "qa";

module.exports = ({ config }) => ({
  ...config,
  name: IS_QA ? "Musum QA" : config.name,
  scheme: IS_QA ? "musum-qa" : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_QA ? "com.flordev.musum.qa" : config.ios?.bundleIdentifier,
  },
});
