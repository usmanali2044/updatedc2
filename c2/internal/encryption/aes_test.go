package encryption

import "testing"

func TestEncryptDecryptRoundTrip(t *testing.T) {
	secret := "unit-test-secret"
	plainText := "whoami /all"

	encrypted, err := EncryptString(plainText, secret)
	if err != nil {
		t.Fatalf("EncryptString returned error: %v", err)
	}

	if encrypted == plainText {
		t.Fatalf("expected encrypted output to differ from plaintext")
	}

	decrypted, err := DecryptString(encrypted, secret)
	if err != nil {
		t.Fatalf("DecryptString returned error: %v", err)
	}

	if decrypted != plainText {
		t.Fatalf("expected %q, got %q", plainText, decrypted)
	}
}

func TestDecryptStringLeavesPlaintextUntouched(t *testing.T) {
	plainText := "legacy plaintext row"

	decrypted, err := DecryptString(plainText, "unit-test-secret")
	if err != nil {
		t.Fatalf("DecryptString returned error: %v", err)
	}

	if decrypted != plainText {
		t.Fatalf("expected plaintext to remain unchanged")
	}
}
