/* eslint-disable jsdoc/require-param-description */
/**
 * Echo handler used by the host worker bridge for the proof-of-concept plugin server surface.
 *
 * @param {unknown} payload
 * @returns {Promise<{ ok: boolean, received: unknown }>}
 */
export default async payload => {
  return {
    ok: true,
    received: payload
  }
}
