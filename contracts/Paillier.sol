// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "./BigNum.sol";

/// @title CipherText Struct
/// @notice A struct to represent an encrypted value
/// @dev The encrypted value is stored as a byte array
struct Ciphertext {
    bytes value;
}

/// @title PublicKey Struct
/// @notice A struct to represent a public key
/// @dev The public key is stored as a byte array
struct PublicKey {
    bytes n;
    bytes g;
}

/// @title PrivateKey Struct
/// @notice A struct to represent a private key
/// @dev The private key is stored as a byte array
struct PrivateKey {
    bytes lambda;
    bytes mu;
}

/// @title Paillier Cryptosystem Implementation
/// @author lodge
/// @notice This contract provides basic operations for the Paillier cryptosystem
/// @dev Uses the BigNum library for large number operations
contract Paillier {
    using BigNum for *;

    /// @notice Adds two encrypted values
    /// @dev Addition of two encrypted values is performed using BigNum for modular arithmetic
    /// @param a The first encrypted value in bytes
    /// @param b The second encrypted value in bytes
    /// @param publicKey The public key in bytes
    /// @return enc_sum The encrypted sum as a BigNumber
    function add(
        Ciphertext calldata a,
        Ciphertext calldata b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_a = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory enc_b = BigNumber(b.value, false, BigNum.bitLength(b.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));

        // Calculate the encrypted sum as enc_a * enc_b % pub_n^2
        BigNumber memory enc_sum = BigNum.mod(BigNum.mul(enc_a, enc_b), BigNum.pow(pub_n, 2));
        return enc_sum;
    }

    /// @notice Adds a plaintext value to an encrypted value
    /// @dev The function computes (Enc(a) * g^b % n^2) to add plaintext b to the encrypted value Enc(a)
    /// @param a The encrypted value as a Ciphertext
    /// @param b The plaintext value as a uint256
    /// @param publicKey The public key as a PublicKey
    /// @return enc_result The new encrypted value as a BigNumber
    function add_const(
        Ciphertext calldata a,
        uint256 b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_a = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));
        BigNumber memory g = BigNumber(publicKey.g, false, BigNum.bitLength(publicKey.g));

        // Calculate the encrypted result as enc_a * g^b % pub_n^2
        BigNumber memory enc_result = BigNum.mod(BigNum.mul(enc_a, BigNum.pow(g, b)), BigNum.pow(pub_n, 2));
        return enc_result;
    }

    /// @notice Subtracts one encrypted value from another
    /// @dev The function computes Enc(a) * Enc(b)^(-1) % n^2 by using Enc(b)^(n-1)
    /// @param a The first encrypted value as a Ciphertext
    /// @param b The second encrypted value as a Ciphertext
    /// @param publicKey The public key as a PublicKey
    /// @return enc_result The result of the subtraction as a BigNumber
    function sub(
        Ciphertext calldata a,
        Ciphertext calldata b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_a = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory enc_b = BigNumber(b.value, false, BigNum.bitLength(b.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));
        BigNumber memory modulus = BigNum.pow(pub_n, 2);
        BigNumber memory neg_enc_b = BigNum.modexp(enc_b, BigNum.sub(pub_n, BigNum.one()), modulus);
        BigNumber memory enc_result = BigNum.mod(enc_a.mul(neg_enc_b), modulus);
        return enc_result;
    }

    /// @notice Subtracts a plaintext constant from an encrypted value
    /// @dev The function computes Enc(a) * g^(-b) % n^2 by using g^(n-1)
    /// @param a The encrypted value as a Ciphertext
    /// @param b The plaintext constant as an int256
    /// @param publicKey The public key as a PublicKey
    /// @return enc_result The result of the subtraction as a BigNumber
    function sub_const(
        Ciphertext calldata a,
        int256 b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_a = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));
        BigNumber memory g = BigNumber(publicKey.g, false, BigNum.bitLength(publicKey.g));
        BigNumber memory bb = BigNumber(abi.encodePacked(b), true, 256);
        BigNumber memory inverse = BigNum.mod(bb, pub_n);
        BigNumber memory modulus = BigNum.pow(pub_n, 2);
        BigNumber memory enc_result = enc_a.mul(BigNum.modexp(g, inverse, modulus)).mod(modulus);
        return enc_result;
    }

    /// @notice Multiplies an encrypted value by a plaintext constant
    /// @dev The encrypted value is exponentiated to the plaintext constant and then taken modulo n^2
    /// @param a The encrypted value in bytes
    /// @param b The plaintext constant
    /// @param publicKey The public key in bytes
    /// @return enc_result The encrypted result as a BigNumber
    function mul_const(
        Ciphertext calldata a,
        uint256 b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_value = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));

        // Calculate the encrypted result as enc_value^b % pub_n^2
        BigNumber memory enc_result = BigNum.mod(BigNum.pow(enc_value, b), BigNum.pow(pub_n, 2));
        return enc_result;
    }

    /// @notice Divides an encrypted value by a plaintext constant
    /// @dev The function computes Enc(a)^(n-1) % n^2 to divide Enc(a) by b
    /// @param a The encrypted value as a Ciphertext
    /// @param b The plaintext constant as a uint256
    /// @param publicKey The public key as a PublicKey
    /// @return enc_result The result of the division as a BigNumber
    function div_const(
        Ciphertext calldata a,
        uint256 b,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory enc_value = BigNumber(a.value, false, BigNum.bitLength(a.value));
        BigNumber memory pub_n = BigNumber(publicKey.n, true, BigNum.bitLength(publicKey.n));
        BigNumber memory bb = BigNumber(abi.encodePacked(b), false, 256);
        BigNumber memory bi = BigNumber(abi.encodePacked(b), false, 256);
        BigNumber memory modulus = BigNum.pow(pub_n, 2);

        // Fermat's Little Theorem: a^(p-1) ≡ 1 (mod p)
        // Therefore, a^(p-2) is the modular inverse of a mod p
        BigNumber memory inverse = BigNum.modexp(bb, bi, pub_n, modulus);

        // Calculate the encrypted result as enc_value^b % pub_n^2
        BigNumber memory enc_result = BigNum.modexp(enc_value, inverse, modulus);

        return enc_result;
    }

    /// @notice Encrypts zero using a random value and a public key
    /// @dev The encryption is performed as r^n % n^2, where r is the random value
    /// @param rnd The random value in bytes
    /// @param publicKey The public key in bytes
    /// @return enc_zero The encrypted zero as a BigNumber
    function encryptZero(bytes memory rnd, PublicKey calldata publicKey) public view returns (BigNumber memory) {
        // Create BigNumber representations for the random value and the public key
        BigNumber memory rand = BigNumber(rnd, false, BigNum.bitLength(rnd));
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));

        // Calculate the encrypted zero as r^n % n^2
        BigNumber memory enc_zero = BigNum.mod(BigNum.mul(rand, pub_n), BigNum.pow(pub_n, 2));

        return enc_zero;
    }

    /// @notice Encrypts a value using a random value and a public key
    /// @dev The encryption is performed as (g^m * r^n) % n^2, where m is the value and r is the random value
    /// @param value The value to encrypt
    /// @param rnd The random value in bytes
    /// @param publicKey The public key in bytes
    /// @return enc_value The encrypted value as a BigNumber
    function encrypt(
        uint256 value,
        bytes memory rnd,
        PublicKey calldata publicKey
    ) public view returns (BigNumber memory) {
        BigNumber memory pub_n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));
        BigNumber memory pub_g = BigNumber(publicKey.g, false, BigNum.bitLength(publicKey.g));
        BigNumber memory alpha = BigNum.modexp(
            pub_g,
            BigNumber(abi.encodePacked(value), false, 256),
            BigNum.pow(pub_n, 2)
        );
        BigNumber memory beta = BigNum.modexp(
            BigNumber(rnd, false, BigNum.bitLength(rnd)),
            pub_n,
            BigNum.pow(pub_n, 2)
        );
        BigNumber memory enc_value = BigNum.mod(BigNum.mul(alpha, beta), BigNum.pow(pub_n, 2));
        return enc_value;
    }

    /// @notice Decrypts an encrypted value using a private key and a public key
    /// @dev The decryption is performed as (((c^(lambda) % n^2) - 1) / n) * mu % n
    /// @param encValue The encrypted value in bytes
    /// @param privateKey The private key in bytes
    /// @param publicKey The public key in bytes
    /// @param sigma The precalculated sigma value (((c^(lambda) % n^2) - 1) / n) in bytes, to prevent expensive bigint division on chain
    /// @return decryptedValue The decrypted value as a BigNumber
    function decrypt(
        Ciphertext calldata encValue,
        PublicKey calldata publicKey,
        PrivateKey calldata privateKey,
        bytes calldata sigma
    ) public view returns (BigNumber memory) {
        // Create BigNumber representations for the encrypted value, private key, and public key
        BigNumber memory enc_value = BigNumber(encValue.value, false, BigNum.bitLength(encValue.value));
        BigNumber memory lambda = BigNumber(privateKey.lambda, false, BigNum.bitLength(privateKey.lambda));
        BigNumber memory mu = BigNumber(privateKey.mu, false, BigNum.bitLength(privateKey.mu));
        BigNumber memory n = BigNumber(publicKey.n, false, BigNum.bitLength(publicKey.n));
        BigNumber memory sig = BigNumber(sigma, false, BigNum.bitLength(sigma));
        BigNumber memory alpha = BigNum.modexp(enc_value, lambda, BigNum.pow(n, 2));

        // verify the precomputed sigma was correct - c^lambda % n^2 / n == sigma
        require(BigNum.divVerify(alpha, n, sig), "Invalid sigma");
        return BigNum.mod(BigNum.mul(sig, mu), n);
    }
}