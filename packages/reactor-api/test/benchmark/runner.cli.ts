import all from "./index";

const next = () => {
  const fn = all.shift();
  if (!fn) {
    process.exit(0);
  }

  fn().catch(console.error).finally(next);
};

next();
