package C2

// exitAfterPush is set when the operator sends exit; c2.go calls Exit() after output is pushed.
var exitAfterPush bool

func requestExitAfterPush() {
	exitAfterPush = true
}

func consumeExitAfterPush() bool {
	if !exitAfterPush {
		return false
	}
	exitAfterPush = false
	return true
}
