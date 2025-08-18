import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { getBountyDetails } from "./get-all-bounties";

dotenv.config();

// Contract address - replace with your deployed contract address
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

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

  console.log(`Connected with address: ${wallet.address}`);

  // Get the contract artifacts for ABI
  const artifactsPath = path.join(
    __dirname,
    "../artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  // Create contract instance
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  // Example 1: Mint a new metadata NFT
  async function mintMetadataNFT() {
    console.log("Minting a new metadata NFT...");

    const sourceUrl = "https://example.com/article";
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Example content"));
    const contentLink = "https://ipfs.io/ipfs/QmExample";
    const embedVectorId = "vector123";
    const createdAt = Math.floor(Date.now() / 1000);
    const tags = ["example", "test", "metadata"];
    const tokenURI = "https://ipfs.io/ipfs/QmMetadata";
    console.log("mintMetadataNFT", [
      sourceUrl,
      contentHash,
      contentLink,
      embedVectorId,
      createdAt,
      tags,
      tokenURI,
    ]);
    try {
      const tx = await contract.mintMetadataNFT(
        sourceUrl,
        contentHash,
        contentLink,
        embedVectorId,
        createdAt,
        tags,
        tokenURI
      );

      const receipt = await tx.wait();
      console.log("Metadata NFT minted successfully!");

      // Get the token ID from the event
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
      );

      if (event) {
        const tokenId = event.args[0];
        console.log(`Token ID: ${tokenId}`);
        return tokenId;
      }
    } catch (error) {
      console.error("Error minting metadata NFT:", error);
    }
  }

  // Example 2: Get metadata for a token
  async function getMetadata(tokenId: bigint) {
    console.log(`Getting metadata for token ${tokenId}...`);

    try {
      const metadata = await contract.getMetadata(tokenId);
      console.log("Metadata:", {
        source_url: metadata.source_url,
        content_hash: metadata.content_hash,
        content_link: metadata.content_link,
        embed_vector_id: metadata.embed_vector_id,
        created_at: Number(metadata.created_at),
        tags: metadata.tags,
        owner: metadata.owner,
      });
    } catch (error) {
      console.error("Error getting metadata:", error);
    }
  }

  // Example 3: Get all metadata created by an address
  async function getMetadataByCreator(creatorAddress: string) {
    console.log(`Getting metadata created by ${creatorAddress}...`);

    try {
      const tokenIds = await contract.getMetadataByCreator(creatorAddress);
      console.log(
        "Token IDs:",
        tokenIds.map((id: any) => Number(id))
      );
      return tokenIds;
    } catch (error) {
      console.error("Error getting metadata by creator:", error);
    }
  }

  // Example 4: Create a bounty
  async function createBounty(amount: string) {
    console.log(`Creating a bounty of ${amount} ETH...`);

    try {
      const tx = await contract.createBounty({
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();
      console.log("Bounty created successfully!");

      // Get the bounty ID from the event
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "BountyCreated"
      );

      if (event) {
        const bountyId = event.args[0];
        console.log(`Bounty ID: ${bountyId}`);
        return bountyId;
      }
    } catch (error) {
      console.error("Error creating bounty:", error);
    }
  }

  // Example 5: Donate to a creator
  async function donateToCreator(tokenId: bigint, amount: string) {
    console.log(`Donating ${amount} ETH to the creator of token ${tokenId}...`);

    try {
      const tx = await contract.donateToCreator(tokenId, {
        value: ethers.parseEther(amount),
      });

      await tx.wait();
      console.log("Donation sent successfully!");
    } catch (error) {
      console.error("Error donating to creator:", error);
    }
  }

  // Example 6: Add a contributor to a bounty (admin only)
  async function addContributor(bountyId: bigint, contributorAddress: string) {
    console.log(
      `Adding contributor ${contributorAddress} to bounty ${bountyId}...`
    );

    try {
      const tx = await contract.addContributor(bountyId, contributorAddress);
      await tx.wait();
      console.log("Contributor added successfully!");
    } catch (error) {
      console.error("Error adding contributor:", error);
    }
  }

  // Example 7: Distribute a bounty (admin only)
  async function distributeBounty(bountyId: bigint) {
    console.log(`Distributing bounty ${bountyId}...`);

    try {
      const tx = await contract.distributeBounty(bountyId);
      await tx.wait();
      console.log("Bounty distributed successfully!");
    } catch (error) {
      console.error("Error distributing bounty:", error);
    }
  }

  // Execute the examples
  try {
    // Example usage flow
    console.log("=== CrawlRegistry Interaction Examples ===");

    // 1. Mint a new metadata NFT
    // const tokenId = await mintMetadataNFT();

    // if (tokenId) {
    //   // 2. Get metadata for the token
    // await getMetadata(tokenId);

    //   // 3. Get all metadata created by the current wallet
    //   await getMetadataByCreator(wallet.address);

    //   // 4. Donate to the creator (which is the current wallet in this case)
    // console.log("Donating to creator");
    //   await donateToCreator(7n, "31");
    //   console.log("Donated to creator");
    // }
    // 5. Create a bounty

    // if (bountyId) {
    //   // 6. Add a contributor to the bounty (requires admin role)
    // const contributorAddress = "0x291AdC431AE72559BF1814c2041dA45E81751E9c"; // Example address
    // await addContributor(0n, contributorAddress);

    // await getBountyDetails(contract, bountyId);
    // 7. Distribute the bounty (requires admin role)
    // await distributeBounty(0n);
    // }
  } catch (error) {
    console.error("Error in execution:", error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
