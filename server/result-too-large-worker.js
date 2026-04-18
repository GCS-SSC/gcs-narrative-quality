/**
 * Test handler that returns a non-serializable result so the host worker bridge can
 * preserve diagnostic detail without widening the public error contract.
 *
 * @returns {Promise<object>}
 */
export default async () => {
  const loop = {}
  loop.self = loop
  return loop
}
