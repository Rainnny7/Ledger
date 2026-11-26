/**
 * One-click image switch. The app can't replace its own container, so after pulling the target
 * image it launches a short-lived helper container from that image that runs `swap-container.ts`.
 */
import { existsSync } from "node:fs"
import { env } from "../config/env.ts"
import { DOCKER_SOCKET, dockerRequest } from "./docker-api.ts"
import { IMAGE_REPOSITORY } from "./updates.ts"

/** Path of the swap script inside the image (the Dockerfile copies all of apps/api). */
const SWAP_SCRIPT = "/app/apps/api/src/admin/swap-container.ts"

/** True when running in Docker with the socket mounted and able to inspect its own container. */
export async function dockerSwitchAvailable(): Promise<boolean> {
	const containerId = process.env.HOSTNAME
	if (
		env.LEDGER_INSTALL !== "docker" ||
		!containerId ||
		!existsSync(DOCKER_SOCKET)
	) {
		return false
	}
	try {
		await dockerRequest("GET", `/containers/${containerId}/json`)
		return true
	} catch {
		return false
	}
}

/**
 * Pulls `imageTag` and starts the helper that swaps this container for one running it.
 * Resolves once the helper is started; the swap itself happens asynchronously.
 */
export async function startContainerSwitch(imageTag: string): Promise<void> {
	const containerId = process.env.HOSTNAME
	if (!containerId) {
		throw new Error("Not running in a container")
	}
	const imageRef = `${IMAGE_REPOSITORY}:${imageTag}`
	const pullLog = await dockerRequest<string>(
		"POST",
		`/images/create?fromImage=${encodeURIComponent(IMAGE_REPOSITORY)}&tag=${encodeURIComponent(imageTag)}`
	)
	// A failed pull still answers 200; the error is a line in the progress stream.
	if (typeof pullLog === "string" && pullLog.includes('"error"')) {
		throw new Error(`Could not pull ${imageRef}`)
	}
	const helper = await dockerRequest<{ Id: string }>(
		"POST",
		"/containers/create",
		{
			Image: imageRef,
			User: "root",
			Entrypoint: ["bun", SWAP_SCRIPT],
			Cmd: [containerId, imageRef],
			HostConfig: {
				AutoRemove: true,
				Binds: [`${DOCKER_SOCKET}:${DOCKER_SOCKET}`],
			},
		}
	)
	await dockerRequest("POST", `/containers/${helper.Id}/start`)
}
