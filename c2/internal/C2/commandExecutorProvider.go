package C2

func provideCommandExecutor() (CommandExecutor, error) {
	googleConnector, err := NewGoogleConnector()
	if err != nil {
		return nil, err
	}

	return NewGoogleCommandExecutor(googleConnector)
}
