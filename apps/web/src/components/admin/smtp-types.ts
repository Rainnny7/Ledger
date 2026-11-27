/** Outbound SMTP settings stored on the server. */
export type SmtpSettings = {
	host: string
	port: number
	secure: boolean
	username: string
	password?: string
	fromAddress: string
	fromName: string
	passwordSet: boolean
	configured: boolean
	dkimDomainName: string
	dkimKeySelector: string
	dkimPrivateKey?: string
	dkimPrivateKeySet: boolean
}

/** Editable SMTP fields in the admin form. */
export type SmtpForm = {
	host: string
	port: string
	secure: boolean
	username: string
	password: string
	fromAddress: string
	fromName: string
	dkimDomainName: string
	dkimKeySelector: string
	dkimPrivateKey: string
}
