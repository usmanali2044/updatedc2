package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

const EncryptedValuePrefix = "enc:v1:"
const defaultAESKey = "gc2-default-embedded-aes-key-2026-keep-this-in-sync"

func EncryptString(value string, secret string) (string, error) {
	if value == "" {
		return "", nil
	}

	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, ciphertext...)

	return EncryptedValuePrefix + base64.StdEncoding.EncodeToString(payload), nil
}

func DecryptString(value string, secret string) (string, error) {
	if value == "" || !strings.HasPrefix(value, EncryptedValuePrefix) {
		return value, nil
	}

	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, EncryptedValuePrefix))
	if err != nil {
		return "", err
	}

	if len(payload) < gcm.NonceSize() {
		return "", fmt.Errorf("encrypted value is too short")
	}

	nonce := payload[:gcm.NonceSize()]
	ciphertext := payload[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func deriveKey(secret string) []byte {
	normalized := strings.TrimSpace(secret)
	if normalized == "" {
		normalized = defaultAESKey
	}

	sum := sha256.Sum256([]byte(normalized))
	return sum[:]
}
