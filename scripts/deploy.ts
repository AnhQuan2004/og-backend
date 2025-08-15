import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  // Connect to the Saga network
  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying from address: ${wallet.address}`);

  // Get the contract artifacts
  const artifactsPath = path.join(
    __dirname,
    "../artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  // Deploy the contract
  console.log("Deploying CrawlRegistry contract...");

  const factory = new ethers.ContractFactory(
    contractArtifact.abi,
    contractArtifact.bytecode,
    wallet
  );

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log(`CrawlRegistry deployed to: ${await contract.getAddress()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
