const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingRoom", function () {
  let VotingRoom;
  let votingRoom;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  // Helper function to create a room ID
  const createRoomId = (str) => ethers.keccak256(ethers.toUtf8Bytes(str));

  beforeEach(async function () {
    VotingRoom = await ethers.getContractFactory("VotingRoom");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    votingRoom = await VotingRoom.deploy();
    await votingRoom.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await votingRoom.owner()).to.equal(owner.address);
    });
  });

  describe("Room Creation", function () {
    it("Should allow owner to create a room", async function () {
      const roomId = createRoomId("test-room");
      const memberIds = [1, 2, 3];

      await expect(votingRoom.createRoom(roomId, memberIds))
        .to.emit(votingRoom, "RoomCreated")
        .withArgs(roomId, await time.latest());
    });

    it("Should not allow non-owner to create a room", async function () {
      const roomId = createRoomId("test-room");
      const memberIds = [1, 2, 3];

      await expect(
        votingRoom.connect(addr1).createRoom(roomId, memberIds)
      ).to.be.revertedWith("Only contract owner can perform this action");
    });

    it("Should not allow duplicate member IDs", async function () {
      const roomId = createRoomId("test-room");
      const memberIds = [1, 1, 2];

      await expect(
        votingRoom.createRoom(roomId, memberIds)
      ).to.be.revertedWith("Duplicate member ID");
    });

    it("Should not allow empty member list", async function () {
      const roomId = createRoomId("test-room");
      const memberIds = [];

      await expect(
        votingRoom.createRoom(roomId, memberIds)
      ).to.be.revertedWith("Cannot create empty room");
    });
  });

  describe("Voting", function () {
    let roomId;
    const memberIds = [1, 2, 3];

    beforeEach(async function () {
      roomId = createRoomId("test-room");
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should allow valid votes", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await expect(votingRoom.connect(addr1).submitVotes(roomId, votes))
        .to.emit(votingRoom, "VotesSubmitted")
        .withArgs(roomId, addr1.address);

      // Finalize room to verify votes
      await votingRoom.finalizeRoom(roomId);
      const finalDetails = await votingRoom.getFinalizedRoomDetails(roomId);
      
      // Verify votes in finalized details
      expect(finalDetails.finalMemberVotes[0].voteCount).to.equal(100);
      expect(finalDetails.finalMemberVotes[1].voteCount).to.equal(200);
      expect(finalDetails.finalMemberVotes[2].voteCount).to.equal(300);
    });

    it("Should not allow duplicate votes from same user", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await votingRoom.connect(addr1).submitVotes(roomId, votes);

      await expect(
        votingRoom.connect(addr1).submitVotes(roomId, votes)
      ).to.be.revertedWith("Already voted");
    });

    it("Should not allow votes after 24 hours", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await time.increase(25 * 60 * 60);

      await expect(
        votingRoom.connect(addr1).submitVotes(roomId, votes)
      ).to.be.revertedWith("Voting period ended");
    });

    it("Should not allow incomplete votes", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 }
      ];

      await expect(
        votingRoom.connect(addr1).submitVotes(roomId, votes)
      ).to.be.revertedWith("Must vote for all members");
    });

    it("Should not allow duplicate member votes", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 1, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await expect(
        votingRoom.connect(addr1).submitVotes(roomId, votes)
      ).to.be.revertedWith("Duplicate vote for member");
    });
  });

  describe("Room Finalization", function () {
    let roomId;
    const memberIds = [1, 2, 3];

    beforeEach(async function () {
      roomId = createRoomId("test-room");
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should allow owner to finalize room and return correct details", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      // Submit votes from multiple participants
      await votingRoom.connect(addr1).submitVotes(roomId, votes);
      await votingRoom.connect(addr2).submitVotes(roomId, votes);

      // Finalize room
      await expect(votingRoom.finalizeRoom(roomId))
        .to.emit(votingRoom, "RoomFinalized")
        .withArgs(roomId);

      // Get and verify finalized details
      const finalDetails = await votingRoom.getFinalizedRoomDetails(roomId);
      expect(finalDetails.totalParticipants).to.equal(2); // Two participants voted
      expect(finalDetails.finalMemberVotes.length).to.equal(3); // Three members
      expect(finalDetails.finalMemberVotes[0].voteCount).to.equal(200); // Sum of votes from both participants
      expect(finalDetails.timestamp).to.not.equal(0);
    });

    it("Should not allow non-owner to finalize room", async function () {
      await expect(
        votingRoom.connect(addr1).finalizeRoom(roomId)
      ).to.be.revertedWith("Only contract owner can perform this action");
    });

    it("Should not allow voting after finalization", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await votingRoom.connect(addr1).submitVotes(roomId, votes);
      await votingRoom.finalizeRoom(roomId);

      await expect(
        votingRoom.connect(addr2).submitVotes(roomId, votes)
      ).to.be.revertedWith("Room already finalized");
    });

    it("Should not allow access to finalized details for non-finalized room", async function () {
      await expect(
        votingRoom.getFinalizedRoomDetails(roomId)
      ).to.be.revertedWith("Room not finalized");
    });
  });

  describe("View Functions", function () {
    let roomId;
    const memberIds = [1, 2, 3];

    beforeEach(async function () {
      roomId = createRoomId("test-room");
      await votingRoom.createRoom(roomId, memberIds);
    });

    it("Should track participant voting status", async function () {
      const votes = [
        { memberId: 1, voteValue: 100 },
        { memberId: 2, voteValue: 200 },
        { memberId: 3, voteValue: 300 }
      ];

      await votingRoom.connect(addr1).submitVotes(roomId, votes);
      expect(await votingRoom.hasParticipantVoted(roomId, addr1.address)).to.be.true;
      expect(await votingRoom.hasParticipantVoted(roomId, addr2.address)).to.be.false;
    });
  });
});