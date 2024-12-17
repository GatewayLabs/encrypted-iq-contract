const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateRandomKeys } = require("paillier-bigint");

describe("VotingRoom", function () {
  let paillier, votingRoom;
  let owner, voter1, voter2, voter3;
  let roomId;
  let publicKey, privateKey;

  function bigIntToHex(bigIntValue) {
    let hexStr = bigIntValue.toString(16);
    if (hexStr.length % 2 !== 0) {
      hexStr = '0' + hexStr;
    }
    return '0x' + hexStr;
  }

  // Helper function to generate room ID
  function generateRoomId(prefix) {
    return ethers.id(prefix + Date.now());
  }

  beforeEach(async () => {
    [owner, voter1, voter2, voter3] = await ethers.getSigners();

    // Generate room ID using helper function
    roomId = generateRoomId("room-");

    // Deploy Paillier mock first
    const Paillier = await ethers.getContractFactory("Paillier");
    paillier = await Paillier.deploy();

    // Deploy VotingRoom with Paillier address
    const VotingRoom = await ethers.getContractFactory("VotingRoom");
    votingRoom = await VotingRoom.deploy(await paillier.getAddress());

    // Generate Paillier keys for testing
    const keys = await generateRandomKeys(2048);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  });

  describe("Constructor & Initial State", function () {
    it("Should set the correct owner", async function () {
      expect(await votingRoom.owner()).to.equal(owner.address);
    });

    it("Should set the correct Paillier contract address", async function () {
      expect(await votingRoom.paillier()).to.equal(await paillier.getAddress());
    });
  });

  describe("Room Creation", function () {
    it("Should create a new room successfully", async function () {
      const memberIds = [1, 2, 3];
      const tx = await votingRoom.createRoom(roomId, memberIds);
      const receipt = await tx.wait();

      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(votingRoom, "RoomCreated")
        .withArgs(roomId, block.timestamp);
    });

    it("Should fail when non-owner tries to create room", async function () {
      const memberIds = [1, 2, 3];
      await expect(
        votingRoom.connect(voter1).createRoom(roomId, memberIds)
      ).to.be.revertedWith("Only contract owner can perform this action");
    });

    it("Should fail when creating room with empty members", async function () {
      await expect(
        votingRoom.createRoom(roomId, [])
      ).to.be.revertedWith("Cannot create empty room");
    });

    it("Should fail when creating room with duplicate members", async function () {
      await expect(
        votingRoom.createRoom(roomId, [1, 2, 2])
      ).to.be.revertedWith("Duplicate member ID");
    });
  });

  describe("Vote Submission", function () {
    const memberIds = [1, 2];

    beforeEach(async function () {
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should accept valid votes", async function () {
      const votes = memberIds.map(id => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(1)))
      }));

      const paillierPublicKey = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await expect(
        votingRoom.connect(voter1).submitVotes(roomId, votes, paillierPublicKey)
      ).to.emit(votingRoom, "VotesSubmitted")
        .withArgs(roomId, voter1.address);
    });

    it("Should prevent double voting", async function () {
      const votes = memberIds.map(id => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(1)))
      }));

      const paillierPublicKey = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await votingRoom.connect(voter1).submitVotes(roomId, votes, paillierPublicKey);

      await expect(
        votingRoom.connect(voter1).submitVotes(roomId, votes, paillierPublicKey)
      ).to.be.revertedWith("Already voted");
    });
  });

  describe("Room Finalization", function () {
    const memberIds = [1, 2];
    const voteValues = [5, 3]; // Example vote values

    beforeEach(async function () {
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should finalize room correctly and verify decrypted votes", async function () {
      // Create encrypted votes
      const votes = memberIds.map((id, index) => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(voteValues[index])))
      }));

      const paillierPublicKey = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      // Submit votes
      await votingRoom.connect(voter1).submitVotes(roomId, votes, paillierPublicKey);

      // Finalize room
      await expect(votingRoom.finalizeRoom(roomId))
        .to.emit(votingRoom, "RoomFinalized")
        .withArgs(roomId);

      // Get finalized details
      const details = await votingRoom.getFinalizedRoomDetails(roomId);
      expect(details.totalParticipants).to.equal(1);
      expect(details.finalMemberVotes.length).to.equal(memberIds.length);

      // Verify each member's vote count by decrypting
      for (let i = 0; i < details.finalMemberVotes.length; i++) {
        const encryptedVote = BigInt(details.finalMemberVotes[i].voteCount.val);
        const decryptedVote = Number(privateKey.decrypt(encryptedVote));

        console.log(`Member ${memberIds[i]} - Expected: ${voteValues[i]}, Got: ${decryptedVote}`);
        expect(decryptedVote).to.equal(voteValues[i]);
      }
    });

    it("Should correctly aggregate multiple votes", async function () {
      // First voter
      const votes1 = memberIds.map((id, index) => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(voteValues[index])))
      }));

      // Second voter with different values
      const votes2 = memberIds.map((id, index) => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(voteValues[index] * 2))) // Double the votes
      }));

      const paillierPublicKey = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      // Submit votes from both voters
      await votingRoom.connect(voter1).submitVotes(roomId, votes1, paillierPublicKey);
      await votingRoom.connect(voter2).submitVotes(roomId, votes2, paillierPublicKey);

      // Finalize room
      await votingRoom.finalizeRoom(roomId);

      // Get finalized details
      const details = await votingRoom.getFinalizedRoomDetails(roomId);
      expect(details.totalParticipants).to.equal(2);
      
      // Verify each member's total votes by decrypting
      for (let i = 0; i < details.finalMemberVotes.length; i++) {
        const encryptedTotal = BigInt(details.finalMemberVotes[i].voteCount.val);
        const decryptedTotal = Number(privateKey.decrypt(encryptedTotal));

        // Expected total is original vote + doubled vote
        const expectedTotal = voteValues[i] + (voteValues[i] * 2);

        console.log(`Member ${memberIds[i]} - Expected total: ${expectedTotal}, Got: ${decryptedTotal}`);
        expect(decryptedTotal).to.equal(expectedTotal);
      }
    });
  });

  describe("Room Queries", function () {
    const memberIds = [1, 2];

    beforeEach(async function () {
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should fail when querying non-existent room", async function () {
      // Use the helper function to generate a non-existent room ID
      const fakeRoomId = generateRoomId("fake-room-");

      await expect(
        votingRoom.hasParticipantVoted(fakeRoomId, voter1.address)
      ).to.be.revertedWith("Room does not exist");
    });

    it("Should track participant votes correctly", async function () {
      expect(await votingRoom.hasParticipantVoted(roomId, voter1.address)).to.be.false;

      const votes = memberIds.map(id => ({
        memberId: id,
        voteValue: bigIntToHex(publicKey.encrypt(BigInt(1)))
      }));

      const paillierPublicKey = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await votingRoom.connect(voter1).submitVotes(roomId, votes, paillierPublicKey);
      expect(await votingRoom.hasParticipantVoted(roomId, voter1.address)).to.be.true;
    });
  });
});