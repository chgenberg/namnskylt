/**
 * Lagergränserna i `.cursor/rules/project-structure.mdc`, kontrollerade av `pnpm lint`.
 * Beroenden går nedåt: app → features → components/hooks → lib → engine.
 */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

/** En feature får bara importera de features som står här. Ny rad kräver ett medvetet beslut. */
const FEATURE_DEPENDENCIES = {
  admin: ["designer"],
  business: ["home"],
  designer: ["home", "visualize"],
  home: ["designer"],
  outreach: ["admin"],
  "outreach-landing": ["invite"],
  shop: ["home"],
  "shop-editor": ["shop"],
};

const FEATURES = readdirSync(join(__dirname, "src/features"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function restrict(group, message) {
  return ["error", { patterns: [{ group, message }] }];
}

const featureBoundaries = FEATURES.map((feature) => {
  const allowed = [feature, ...(FEATURE_DEPENDENCIES[feature] ?? [])];
  return {
    files: [`src/features/${feature}/**`],
    rules: {
      "no-restricted-imports": restrict(
        ["@/app/**", "@/features/*/**", ...allowed.map((name) => `!@/features/${name}/**`)],
        "En feature importerar inte en annan feature. Flytta det delade till components eller lib, eller lägg till beroendet i FEATURE_DEPENDENCIES.",
      ),
    },
  };
});

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript"],
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-restricted-imports": restrict(
      ["@/app/**"],
      "Inget importerar från src/app — flytta koden till features, components eller lib.",
    ),
  },
  overrides: [
    {
      files: ["src/engine/**"],
      rules: {
        "no-restricted-imports": restrict(
          ["@/**", "react", "react-dom", "react/**", "next", "next/**", "three", "three/**"],
          "Motorn är ren TypeScript: bara relativa importer inom src/engine.",
        ),
      },
    },
    {
      files: ["src/lib/**"],
      rules: {
        "no-restricted-imports": restrict(
          ["@/app/**", "@/features/**", "@/components/**", "@/hooks/**"],
          "src/lib får inte bero på UI-lagren (features, components, hooks, app).",
        ),
      },
    },
    {
      files: ["src/components/**", "src/hooks/**"],
      rules: {
        "no-restricted-imports": restrict(
          ["@/app/**", "@/features/**"],
          "Delad kod får inte bero på features eller app — flytta ner det som delas.",
        ),
      },
    },
    ...featureBoundaries,
    { files: ["scripts/**"], rules: { "no-console": "off" } },
  ],
};
