rg -n \
  --glob '**/*.{ts,tsx,js,jsx,css,scss,html,mdx}' \
  --glob '!**/*.stories.tsx' \
  --glob '!**/*.test.tsx' \
  --glob '!**/*.md' \
  --glob '!**/*.md.**' \
  --glob '!**/eslint.config.js' \
  --glob '!**/*.spec.tsx' \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!apps/academy/**' \
  --glob '!packages/reactor-api/**' \
  --glob '!packages/reactor/**' \
  --glob '!packages/codegen/src/file-builders/document-model/migrate-legacy.ts' \
  --glob '!packages/switchboard-gui/**' \
  --glob '!**/test/**' \
  --glob '!**/tests/**' \
  --glob '!**/build/**' \
  --glob '!**/.next/**' \
  --glob '!**/coverage/**' \
  --glob '!**/.turbo/**' \
  --glob '!**/.nx/**' \
  '\b(?:bg|text|border|ring|shadow|divide|outline|fill|stroke|placeholder|caret|accent|from|via|to|decoration|drop-shadow|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|backdrop-blur|backdrop-brightness|backdrop-contrast|backdrop-grayscale|backdrop-hue-rotate|backdrop-invert|backdrop-opacity|backdrop-saturate|backdrop-sepia)-\[[^]]+\]' \
  . \
  | awk -F: '
    BEGIN {
      print "# Arbitrary Tailwind Style Candidates\n"
      print "This report lists places in the codebase that use Tailwind arbitrary-value utilities."
      print "These may need design review, especially for dark mode, theme tokens, hardcoded colors, shadows, filters, and gradients.\n"
    }

    {
      file = $1
      line = $2

      text = $0
      sub(file ":" line ":", "", text)

      if (file != currentFile) {
        currentFile = file
        print "\n## `" file "`\n"
      }

      print "- **Line " line "**: `" text "`"
    }
  ' > arbitrary-tailwind-candidates.md