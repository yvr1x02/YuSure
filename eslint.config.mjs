import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Pages are fetched only through @/lib/safe-request (ADR-0002): cheerio parses, never downloads.
const noFetch = "Requests to a user's address go only through @/lib/safe-request (ADR-0002).";
const parserOnly = "Parse HTML through @/lib/checks/html, the only module that imports cheerio.";
const restrictedImports = (cheerio) => [
  "error",
  {
    paths: [
      { name: "cheerio", ...cheerio },
      { name: "cheerio/slim", message: parserOnly },
      { name: "undici", message: noFetch },
    ],
  },
];

// The same rule for import("…"): no-restricted-imports only sees static imports.
const dynamicImport = (name, message) => ({
  selector: `ImportExpression[source.value='${name}'], ImportExpression[source.quasis.0.value.cooked='${name}']`,
  message,
});
const noDynamicUndici = dynamicImport("undici", noFetch);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": restrictedImports({ message: parserOnly }),
      "no-restricted-properties": ["error", { property: "fromURL", message: noFetch }],
      "no-restricted-syntax": [
        "error",
        dynamicImport("cheerio", parserOnly),
        dynamicImport("cheerio/slim", parserOnly),
        noDynamicUndici,
      ],
    },
  },
  {
    files: ["src/lib/checks/html.ts"],
    rules: {
      "no-restricted-imports": restrictedImports({ importNames: ["fromURL"], message: noFetch }),
      "no-restricted-syntax": ["error", noDynamicUndici],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
