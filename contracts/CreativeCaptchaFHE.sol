// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CreativeCaptchaFHE is SepoliaConfig {
    struct EncryptedChallenge {
        uint256 id;
        euint32 encryptedPrompt;   // Encrypted prompt
        euint32 encryptedResponse; // Encrypted user response
        uint256 timestamp;
    }

    struct DecryptedChallenge {
        string prompt;
        string response;
        bool isVerified;
    }

    uint256 public challengeCount;
    mapping(uint256 => EncryptedChallenge) public encryptedChallenges;
    mapping(uint256 => DecryptedChallenge) public decryptedChallenges;

    mapping(string => euint32) private encryptedResponseCount;
    string[] private responseCategories;

    mapping(uint256 => uint256) private requestToChallengeId;

    event ChallengeSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event ChallengeDecrypted(uint256 indexed id);

    modifier onlyParticipant(uint256 challengeId) {
        _;
    }

    function submitEncryptedChallenge(
        euint32 encryptedPrompt,
        euint32 encryptedResponse
    ) public {
        challengeCount += 1;
        uint256 newId = challengeCount;

        encryptedChallenges[newId] = EncryptedChallenge({
            id: newId,
            encryptedPrompt: encryptedPrompt,
            encryptedResponse: encryptedResponse,
            timestamp: block.timestamp
        });

        decryptedChallenges[newId] = DecryptedChallenge({
            prompt: "",
            response: "",
            isVerified: false
        });

        emit ChallengeSubmitted(newId, block.timestamp);
    }

    function requestChallengeDecryption(uint256 challengeId) public onlyParticipant(challengeId) {
        EncryptedChallenge storage challenge = encryptedChallenges[challengeId];
        require(!decryptedChallenges[challengeId].isVerified, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(challenge.encryptedPrompt);
        ciphertexts[1] = FHE.toBytes32(challenge.encryptedResponse);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptChallenge.selector);
        requestToChallengeId[reqId] = challengeId;

        emit DecryptionRequested(challengeId);
    }

    function decryptChallenge(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 challengeId = requestToChallengeId[requestId];
        require(challengeId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        DecryptedChallenge storage dChallenge = decryptedChallenges[challengeId];
        dChallenge.prompt = results[0];
        dChallenge.response = results[1];
        dChallenge.isVerified = true;

        if (!FHE.isInitialized(encryptedResponseCount[dChallenge.response])) {
            encryptedResponseCount[dChallenge.response] = FHE.asEuint32(0);
            responseCategories.push(dChallenge.response);
        }
        encryptedResponseCount[dChallenge.response] = FHE.add(
            encryptedResponseCount[dChallenge.response],
            FHE.asEuint32(1)
        );

        emit ChallengeDecrypted(challengeId);
    }

    function getDecryptedChallenge(uint256 challengeId) public view returns (
        string memory prompt,
        string memory response,
        bool isVerified
    ) {
        DecryptedChallenge storage c = decryptedChallenges[challengeId];
        return (c.prompt, c.response, c.isVerified);
    }

    function getEncryptedResponseCount(string memory response) public view returns (euint32) {
        return encryptedResponseCount[response];
    }

    function requestResponseCountDecryption(string memory response) public {
        euint32 count = encryptedResponseCount[response];
        require(FHE.isInitialized(count), "Response not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptResponseCount.selector);
        requestToChallengeId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(response)));
    }

    function decryptResponseCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 responseHash = requestToChallengeId[requestId];
        string memory response = getResponseFromHash(responseHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getResponseFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < responseCategories.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(responseCategories[i]))) == hash) {
                return responseCategories[i];
            }
        }
        revert("Response not found");
    }
}