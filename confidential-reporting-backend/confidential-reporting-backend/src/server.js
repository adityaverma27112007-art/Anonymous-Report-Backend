require("dotenv").config();

async function main() {
  const { bootstrapModerator } = require("./bootstrap");
  await bootstrapModerator();

  const { app } = require("./app");
  const port = Number(process.env.PORT || 3000);

  app.listen(port, () => {
    console.log(`Confidential reporting API listening on port ${port}`);
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
