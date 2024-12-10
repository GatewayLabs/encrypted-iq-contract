// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Paillier.sol";

contract EncryptedIQCalculator {
    using BigNum for *;
    
    struct ActiveGroup {
        BigNumber[] encryptedScores;
        address owner;
        mapping(address => bool) hasSubmitted;
    }
    
    struct GroupResult {
        bytes encryptedSum;
        uint256 count;
    }
    
    Paillier public paillier;
    mapping(bytes32 => ActiveGroup) public activeGroups;
    mapping(bytes32 => GroupResult) public finalizedResults;
    
    event GroupCreated(bytes32 indexed groupId, address owner);
    event ScoreSubmitted(bytes32 indexed groupId, address indexed participant);
    event GroupFinalized(bytes32 indexed groupId, bytes encryptedSum, uint256 count);
    
    constructor(address _paillier) {
        paillier = Paillier(_paillier);
    }
    
    modifier onlyGroupOwner(bytes32 groupId) {
        require(activeGroups[groupId].owner == msg.sender, "Not group owner");
        _;
    }

    modifier groupNotFinalized(bytes32 groupId) {
        require(finalizedResults[groupId].encryptedSum.length == 0, "Group already finalized");
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
    
    function createGroup(bytes32 groupId) external {
        // First check if room exists in active groups
        require(activeGroups[groupId].owner == address(0), "Group exists in active groups");
    
        // Then check if room exists in finalized results 
        require(finalizedResults[groupId].encryptedSum.length == 0, "Group exists in finalized results");

        activeGroups[groupId].owner = msg.sender;
        emit GroupCreated(groupId, msg.sender);
    }


    function getGroupDetails(bytes32 groupId) external view returns (
        address owner,
        uint256 participantCount,
        bool isActive
    ) {
        ActiveGroup storage group = activeGroups[groupId];
        owner = group.owner;
        participantCount = group.encryptedScores.length;
        isActive = (owner != address(0) && finalizedResults[groupId].encryptedSum.length == 0);
        return (owner, participantCount, isActive);
    }


     function hasParticipantSubmitted(bytes32 groupId, address participant) external view returns (bool) {
        require(activeGroups[groupId].owner != address(0) || finalizedResults[groupId].encryptedSum.length > 0, 
                "Group does not exist");
        return activeGroups[groupId].hasSubmitted[participant];
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
        ActiveGroup storage group = activeGroups[groupId];
        require(group.encryptedScores.length > 0, "No scores");

        // Calculate sum
        BigNumber memory sum = _calculateSum(groupId, publicKey);
        uint256 count = group.encryptedScores.length;
        
        // Store both sum and count
        finalizedResults[groupId] = GroupResult({
            encryptedSum: sum.val,
            count: count
        });
        
        emit GroupFinalized(groupId, sum.val, count);

        // Delete the active group data
        delete activeGroups[groupId];
    }
    
    function getResult(bytes32 groupId) external view returns (bytes memory sum, uint256 count) {
        require(finalizedResults[groupId].encryptedSum.length > 0, "Not finalized");
        GroupResult memory result = finalizedResults[groupId];
        return (result.encryptedSum, result.count);
    }

    function isFinalized(bytes32 groupId) external view returns (bool) {
        return finalizedResults[groupId].encryptedSum.length > 0;
    }

    // Internal function to calculate only the sum
    function _calculateSum(
        bytes32 groupId,
        PublicKey calldata publicKey
    ) internal view returns (BigNumber memory) {
        ActiveGroup storage group = activeGroups[groupId];
        BigNumber memory total = group.encryptedScores[0];
        
 
        
        // Sum all encrypted scores
        for (uint256 i = 1; i < group.encryptedScores.length; i++) {
          
            total = paillier.add(
                Ciphertext(total.val),
                Ciphertext(group.encryptedScores[i].val),
                publicKey
            );
        }
        
        return total;
    }
}