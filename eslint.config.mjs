import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * MB-2, tier 1. `transition: all` is the reference's blanket and the reason the site's own
 * duration classes computed to nothing for a year, so it is banned on both surfaces — the
 * console writes none today, which makes this rule free and keeps the blanket from coming
 * back. It reads string literals and template elements because a Tailwind class list only
 * ever exists inside one of those; the AST is also what makes it exact, where a grep is
 * fooled by the prose that explains the rule. The rest of the motion rules — a duration or
 * curve written at the call site instead of asked for by role — need to see CSS too, and
 * that is `scripts/motion-check.mjs`, which `npm run motion:check` and the vitest suite run.
 */
const shamah = {
  rules: {
    "no-blanket-transition": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          blanket:
            "`transition: all` animates every property a control has, including the ones that reflow. Name the properties and give them a token (see src/styles/tokens.css).",
        },
      },
      create(context) {
        const report = (node, text) => {
          if (/\btransition-all\b/.test(text)) context.report({ node, messageId: "blanket" });
        };
        return {
          Literal(node) {
            if (typeof node.value === "string") report(node, node.value);
          },
          TemplateElement(node) {
            report(node, node.value.raw);
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { shamah },
    rules: { "shamah/no-blanket-transition": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The deploy build writes here (NEXT_DIST_DIR); its types are generated, not ours.
    ".next-build/**",
    // Scratch: logs, probes, and the unpacked deploy artifact (gitignored, never ours).
    ".tmp/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
