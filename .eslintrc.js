module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: [
        'standard-with-typescript',
        'plugin:react/recommended',
        'prettier',
    ],
    overrides: [
        {
            env: {
                node: true,
            },
            files: ['.eslintrc.{js,cjs}'],
            parserOptions: {
                sourceType: 'script',
            },
        },
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: ['react', 'jest-dom'],
    rules: {
        'react/react-in-jsx-scope': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/array-type': 'off',
        '@typescript-eslint/prefer-function-type': 'off',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/no-confusing-void-expression': 'off',
        '@typescript-eslint/consistent-type-definitions': 'off',
    },
    settings: {
        react: {
            version: 'detect',
        },
    },
};
