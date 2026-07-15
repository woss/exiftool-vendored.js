/** @type {import('npm-check-updates').RunOptions} */
module.exports = {
  // Cooldown: 0 days for packages we own (upgrade immediately), 7 days for
  // third-party packages, to reduce supply-chain attack surface.
  /** @param {string} packageName - The name of the dependency */
  cooldown: (packageName) => {
    const ownPackages = [
      "batch-cluster",
      "exiftool-vendored.exe",
      "exiftool-vendored.pl",
    ];
    return packageName.startsWith("@photostructure/") ||
      packageName.startsWith("@mceachen/") ||
      ownPackages.includes(packageName)
      ? 0
      : 7;
  },
  // Packages we deliberately hold back, with the reason for each.
  reject: [
    // TypeScript 7 (the native compiler) isn't supported yet by typedoc
    // (peer <=6.0.x) or typescript-eslint (peer <6.1.0). Revisit once both
    // ship TS 7 support.
    "typescript",

    // Newer majors of the test/lint stack went ESM-only; we're not ready to
    // leave CommonJS yet.
    "@types/chai",
    "@types/chai-as-promised",
    "@types/mocha",
    "chai",
    "chai-as-promised",
    "deep-eql",
    "eslint",
    "mocha",
  ],
};
