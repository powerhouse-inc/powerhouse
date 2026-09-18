export const wave = {
  displayName: "Wave",
  logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
  description: "Waves.",
  authors: ["fixture"],
  categories: ["CORE"],
  auth: undefined,
  minimumSupportedRelease: "0.30.0",
  actions() {
    return {
      say_hello: {
        name: "say_hello",
        displayName: "Wave hello",
        description: "",
        requireAuth: false,
        props: {
          who: {
            type: "SHORT_TEXT",
            displayName: "Who",
            required: true,
            options: () => Promise.resolve([]),
          },
        },
        run: (who: string) => Promise.resolve(`o/ ${who}`),
      },
    };
  },
  triggers() {
    return {};
  },
};
