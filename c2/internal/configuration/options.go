package configuration

import (
	"net/url"
)

type options struct {
	googleServiceAccountKey string
	googleSheetID           string
	aesKey                  string
	rowID                   int
	proxy                   *url.URL
	verbose                 bool
}

var command options

func SetOptions(
	googleServiceAccountKey,
	googleSheetID,
	aesKey string,
	rowID int,
	proxy *url.URL,
	verbose bool,
) {
	command.googleServiceAccountKey = googleServiceAccountKey
	command.googleSheetID = googleSheetID
	command.aesKey = aesKey
	command.proxy = proxy
	command.rowID = rowID
	command.verbose = verbose
}

func GetOptionsGoogleServiceAccountKey() string {
	return command.googleServiceAccountKey
}

func GetOptionsGoogleSheetID() string {
	return command.googleSheetID
}

func GetOptionsAESKey() string {
	return command.aesKey
}

func GetOptionsProxy() *url.URL {
	return command.proxy
}

func GetOptionsDebug() bool {
	return command.verbose
}

func GetSourceFirstCommandIndex() int {
	return command.rowID
}
