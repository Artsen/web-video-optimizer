import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "**/coverage/**",
      "data/**",
      ".agents/**",
      ".codex/**",
      "*.zip",
      "package-lock.json"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.config.{js,mjs,ts}", "eslint.config.mjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["apps/api/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["./integration/**", "../integration/**", "../../integration/**"]
        }
      ]
    }
  },
  {
    files: ["packages/video-core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "cors", "multer", "react", "react-dom", "node:fs", "node:path", "node:child_process"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/app.ts", "apps/api/src/routes/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "node:child_process"],
          patterns: [
            "../services/**",
            "../infrastructure/**",
            "../repositories/**",
            "../persistence/**",
            "../entities/**"
          ]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "multer", "react", "react-dom", "node:child_process"],
          patterns: ["../routes/**"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/scheduling/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "multer", "react", "react-dom", "node:child_process"],
          patterns: [
            "../routes/**",
            "../dto/**",
            "../repositories/**",
            "../persistence/**",
            "../services/**",
            "../infrastructure/**"
          ]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/services/job-lifecycle-service.ts", "apps/api/src/services/job-lifecycle-service.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "multer", "react", "react-dom", "node:child_process"]
        }
      ]
    }
  },
  {
    files: [
      "apps/api/src/*.ts",
      "apps/api/src/runtime/**/*.ts",
      "apps/api/src/repositories/**/*.ts",
      "apps/api/src/persistence/**/*.ts",
      "apps/api/src/entities/**/*.ts",
      "apps/api/src/dto/**/*.ts",
      "apps/api/src/scheduling/**/*.ts"
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["node:child_process"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/repositories/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "react", "react-dom"],
          patterns: ["../routes/**", "../dto/**", "../services/**"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/infrastructure/tools/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "multer", "react", "react-dom"],
          patterns: ["../../routes/**", "../../dto/**"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/persistence/**/*.ts", "apps/api/src/entities/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["express", "react", "react-dom"],
          patterns: ["../routes/**", "../services/**"]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/server-lifecycle.ts", "apps/api/src/server-lifecycle.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["./services/**", "./routes/**", "./persistence/**", "./repositories/**"]
        }
      ]
    }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "../../api/src/scheduling/**",
            "../../api/src/services/**",
            "../../api/src/persistence/**",
            "../../api/src/runtime/**"
          ]
        }
      ]
    }
  }
);
