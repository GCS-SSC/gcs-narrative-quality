/**
 * Test handler that throws so the host worker bridge can verify error normalization.
 */
export default async () => {
  throw new Error('BOOM')
}
