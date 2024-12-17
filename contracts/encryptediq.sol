// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./Paillier.sol";


contract VotingRoom {
    address public immutable owner;
    Paillier public paillier;


    struct Member {
        uint256 id;
        BigNumber voteCount;
    }

    struct Vote {
        uint256 memberId;
        bytes voteValue;
    }
    
    struct ActiveRoom {
        uint256 timestamp;
        Member[] members;
        mapping(address => bool) hasVoted;
        address[] participants;
    }
    
    struct RoomResult {
        uint256 timestamp;
        uint256 totalParticipants;
        mapping(uint256 => BigNumber) memberVotes;
        bool isFinalized;
    }
    
    struct FinalizedRoomDetails {
        uint256 timestamp;
        uint256 totalParticipants;
        Member[] finalMemberVotes;
    }
    
    mapping(bytes32 => ActiveRoom) public activeRooms;
    mapping(bytes32 => RoomResult) public finalizedResults;
    mapping(bytes32 => Member[]) private finalizedMemberVotes;  
    
    event RoomCreated(bytes32 indexed roomId, uint256 timestamp);
    event VotesSubmitted(bytes32 indexed roomId, address indexed voter);
    event RoomFinalized(bytes32 indexed roomId);

    modifier onlyContractOwner() {
        require(msg.sender == owner, "Only contract owner can perform this action");
        _;
    }

    modifier roomExists(bytes32 roomId) {
        require(activeRooms[roomId].timestamp != 0, "Room doesn't exist");
        _;
    }

    modifier roomNotFinalized(bytes32 roomId) {
        require(!finalizedResults[roomId].isFinalized, "Room already finalized");
        _;
    }

    modifier hasNotVoted(bytes32 roomId) {
        require(!activeRooms[roomId].hasVoted[msg.sender], "Already voted");
        _;
    }

    modifier votingPeriodActive(bytes32 roomId) {
        require(block.timestamp <= activeRooms[roomId].timestamp + 24 hours, "Voting period ended");
        _;
    }
    
    constructor(address _paillier) {
        owner = msg.sender;
        paillier = Paillier(_paillier);
    }

  
    
    function createRoom(
        bytes32 roomId,
        uint256[] memory memberIds
    ) external onlyContractOwner {
        require(activeRooms[roomId].timestamp == 0, "Room exists in active rooms");
        require(!finalizedResults[roomId].isFinalized, "Room exists in finalized results");
        require(memberIds.length > 0, "Cannot create empty room");
        
        // Check for duplicate IDs
        for(uint i = 0; i < memberIds.length; i++) {
            for(uint j = i + 1; j < memberIds.length; j++) {
                require(memberIds[i] != memberIds[j], "Duplicate member ID");
            }
        }
        
        ActiveRoom storage newRoom = activeRooms[roomId];
        newRoom.timestamp = block.timestamp;
       

        
        for(uint i = 0; i < memberIds.length; i++) {
            newRoom.members.push(Member({
                id: memberIds[i],
                voteCount: BigNumber(BigNum.ZERO, false, 0)
            }));
        }
        
        emit RoomCreated(roomId, block.timestamp);
    }
    
    function submitVotes(
        bytes32 roomId,
        Vote[] calldata votes,
        PublicKey calldata publicKey
    ) external 
        roomNotFinalized(roomId)
        roomExists(roomId)
        hasNotVoted(roomId)
        votingPeriodActive(roomId)
    {
        ActiveRoom storage room = activeRooms[roomId];
        
        require(votes.length == room.members.length, "Must vote for all members");
        
        // Check for duplicate votes and process votes
        for(uint i = 0; i < votes.length; i++) {
            bool memberFound = false;
            bool isDuplicate = false;
            
            // Check if this vote is a duplicate
            for(uint k = 0; k < i; k++) {
                if(votes[k].memberId == votes[i].memberId) {
                    isDuplicate = true;
                    break;
                }
            }
            require(!isDuplicate, "Duplicate vote for member");
            
            // Find member and record vote
            for(uint j = 0; j < room.members.length; j++) {
                if(room.members[j].id == votes[i].memberId) {
                    // adding vote to that particular memeber
                    BigNumber memory currentVote = BigNumber(votes[i].voteValue, false, BigNum.bitLength(votes[i].voteValue));

                    if (isZeroBigNumber(room.members[j].voteCount)) {
                        room.members[j].voteCount = currentVote;
                    } else {
                        room.members[j].voteCount = paillier.add(Ciphertext(room.members[j].voteCount.val), Ciphertext(currentVote.val) , publicKey);
                    }
                    memberFound = true;
                    break;
                }
            }
            require(memberFound, "Invalid member ID");
        }
        
        // Verify all members received a vote
        for(uint i = 0; i < room.members.length; i++) {
            bool hasVote = false;
            for(uint j = 0; j < votes.length; j++) {
                if(room.members[i].id == votes[j].memberId) {
                    hasVote = true;
                    break;
                }
            }
            require(hasVote, "Missing vote for member");
        }
        
        room.hasVoted[msg.sender] = true;
        room.participants.push(msg.sender);
        
        emit VotesSubmitted(roomId, msg.sender);
    }
    
    function finalizeRoom(bytes32 roomId) 
        external 
        onlyContractOwner
        roomNotFinalized(roomId)
    {
        ActiveRoom storage room = activeRooms[roomId];
        RoomResult storage result = finalizedResults[roomId];
        
        // Store room details
        result.timestamp = room.timestamp;
        result.totalParticipants = room.participants.length;
        
        // Store member votes and create final member array
        Member[] storage finalMembers = finalizedMemberVotes[roomId];
        for(uint i = 0; i < room.members.length; i++) {
            result.memberVotes[room.members[i].id] = room.members[i].voteCount;
            finalMembers.push(Member({
                id: room.members[i].id,
                voteCount: room.members[i].voteCount
            }));
        }
        
        result.isFinalized = true;
        
        emit RoomFinalized(roomId);
        
        delete activeRooms[roomId];
    }

    function getFinalizedRoomDetails(bytes32 roomId) 
        external 
        view 
        returns (FinalizedRoomDetails memory) 
    {
        require(finalizedResults[roomId].isFinalized, "Room not finalized");
        
        return FinalizedRoomDetails({
            timestamp: finalizedResults[roomId].timestamp,
            totalParticipants: finalizedResults[roomId].totalParticipants,
            finalMemberVotes: finalizedMemberVotes[roomId]
        });
    }
    
    function hasParticipantVoted(bytes32 roomId, address participant) external view returns (bool) {
        require(activeRooms[roomId].timestamp != 0 || finalizedResults[roomId].isFinalized, 
                "Room does not exist");
        return activeRooms[roomId].hasVoted[participant];
    }

    function isZeroBigNumber(BigNumber memory a) internal pure returns(bool) {
    
        bool isValueZero = true;
        bytes memory val = a.val;
        uint256 length = val.length;
        
        for(uint i = 0; i < length; i++) {
            if(val[i] != 0) {
                isValueZero = false;
                break;
            }
        }
        
        return isValueZero && 
            length == 0x20 && 
            !a.neg && 
            a.bitlen == 0;
    }
}