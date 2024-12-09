// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Paillier.sol";
import "hardhat/console.sol";


contract EncryptedIQCalculator {
    using BigNum for *;
    
    struct ActiveGroup {
        BigNumber[] encryptedScores;
        address owner;
        mapping(address => bool) hasSubmitted;
    }
    
    Paillier public paillier;
    mapping(bytes32 => ActiveGroup) public activeGroups;
    mapping(bytes32 => bytes) public finalizedAverages;
    
    event GroupCreated(bytes32 indexed groupId, address owner);
    event ScoreSubmitted(bytes32 indexed groupId, address indexed participant);
    event GroupFinalized(bytes32 indexed groupId, bytes encryptedAverage);
    
    constructor(address _paillier) {
        paillier = Paillier(_paillier);
    }
    
    modifier onlyGroupOwner(bytes32 groupId) {
        require(activeGroups[groupId].owner == msg.sender, "Not group owner");
        _;
    }

    modifier groupNotFinalized(bytes32 groupId) {
        require(finalizedAverages[groupId].length == 0, "Group already finalized");
        _;
    }

    modifier groupExists(bytes32 groupId) {
        require(activeGroups[groupId].owner != address(0), "Group doesn't exist");
        _;
    }

    modifier hasNotSubmitted(bytes32 groupId) {
        require(!activeGroups[groupId].hasSubmitted[msg.sender], "Already submitted score");
        _;
    }
    
    function createGroup(bytes32 groupId) external groupNotFinalized(groupId) {
        require(activeGroups[groupId].owner == address(0), "Group exists");
        
        activeGroups[groupId].owner = msg.sender;
        emit GroupCreated(groupId, msg.sender);
    }
    
    function submitScore(
        bytes32 groupId,
        bytes calldata encryptedScore
    ) external 
      groupExists(groupId) 
      groupNotFinalized(groupId)
      hasNotSubmitted(groupId) 
    {
        ActiveGroup storage group = activeGroups[groupId];
        
        BigNumber memory score = BigNumber(
            encryptedScore,
            false,
            BigNum.bitLength(encryptedScore)
        );
        
        group.encryptedScores.push(score);
        group.hasSubmitted[msg.sender] = true;
        
        emit ScoreSubmitted(groupId, msg.sender);
    }
    
    function finalizeGroup(
        bytes32 groupId,
        PublicKey calldata publicKey
    ) external onlyGroupOwner(groupId) groupNotFinalized(groupId) {
        console.log("hellllllllllllllllllllo");
        ActiveGroup storage group = activeGroups[groupId];
        require(group.encryptedScores.length > 0, "No scores");

        // Calculate average
        BigNumber memory average = _calculateAverage(groupId, publicKey);
        
        // Store only the encrypted average
        finalizedAverages[groupId] = average.val;

        console.log("average given");
        
        emit GroupFinalized(groupId, average.val);

        // Delete the active group data
        delete activeGroups[groupId];
    }
    
    function getAverage(bytes32 groupId) external view returns (bytes memory) {
        require(finalizedAverages[groupId].length > 0, "Not finalized");
        return finalizedAverages[groupId];
    }

    function isFinalized(bytes32 groupId) external view returns (bool) {
        return finalizedAverages[groupId].length > 0;
    }

    // Internal function to calculate the average
    function _calculateAverage(
        bytes32 groupId,
        PublicKey calldata publicKey
    ) internal view returns (BigNumber memory) {
        ActiveGroup storage group = activeGroups[groupId];
        BigNumber memory total = group.encryptedScores[0];
        
        // Sum all encrypted scores
        for (uint256 i = 1; i < group.encryptedScores.length; i++) {
            total = paillier.add(
                total.tobytes(),
                group.encryptedScores[i].val,
                publicKey
            );
        }
        
        // Divide by number of participants to get average
        return paillier.div_const(
            Ciphertext(total.val),
            group.encryptedScores.length,
            publicKey
        );
    }
}