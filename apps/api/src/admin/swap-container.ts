/**
 * Runs inside a helper container started by docker-switch.ts, from the *new* image.
 * Replaces the old container with a clone (same config, host config, labels, networks) running
 * the new image. If anything fails the old container is renamed back and restarted.
 *
 * Usage: bun swap-container.ts <old container id> <image ref>
 */
import { dockerRequest } from "./docker-api.ts"

type NetworkEndpoint = {
	Aliases?: string[] | null
	IPAMConfig?: unknown
	Links?: unknown
}

type Inspect = {
	Name: string
	Config: Record<string, unknown>
	HostConfig: Record<string, unknown>
	NetworkSettings: { Networks: Record<string, NetworkEndpoint> }
}

const [oldId, imageRef] = process.argv.slice(2)
if (!oldId || !imageRef) {
	throw new Error("usage: swap-container.ts <container id> <image>")
}

const old = await dockerRequest<Inspect>("GET", `/containers/${oldId}/json`)
const name = old.Name.replace(/^\//, "")
const backupName = `${name}-old`
const shortId = oldId.slice(0, 12)

let newId: string | null = null
try {
	// Ports and the name are exclusive, so the old container must stop before the clone starts.
	await dockerRequest("POST", `/containers/${oldId}/stop`)
	await dockerRequest(
		"POST",
		`/containers/${oldId}/rename?name=${encodeURIComponent(backupName)}`
	)
	// Dropping Hostname lets the clone get its own id, which the app uses to find itself.
	const { Hostname: _hostname, ...config } = old.Config
	const endpoints = Object.fromEntries(
		Object.entries(old.NetworkSettings.Networks).map(
			([network, endpoint]) => [
				network,
				{
					IPAMConfig: endpoint.IPAMConfig,
					Links: endpoint.Links,
					Aliases: (endpoint.Aliases ?? []).filter(
						(alias) => alias !== shortId
					),
				},
			]
		)
	)
	const created = await dockerRequest<{ Id: string }>(
		"POST",
		`/containers/create?name=${encodeURIComponent(name)}`,
		{
			...config,
			Image: imageRef,
			HostConfig: old.HostConfig,
			NetworkingConfig: { EndpointsConfig: endpoints },
		}
	)
	newId = created.Id
	await dockerRequest("POST", `/containers/${newId}/start`)
	await dockerRequest("DELETE", `/containers/${oldId}`)
	console.log(`Switched ${name} to ${imageRef}`)
} catch (error) {
	console.error("Switch failed, restoring the previous container:", error)
	if (newId) {
		await dockerRequest("DELETE", `/containers/${newId}?force=true`).catch(
			() => {}
		)
	}
	await dockerRequest(
		"POST",
		`/containers/${oldId}/rename?name=${encodeURIComponent(name)}`
	).catch(() => {})
	await dockerRequest("POST", `/containers/${oldId}/start`).catch(() => {})
	process.exit(1)
}
