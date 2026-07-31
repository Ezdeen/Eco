import test from 'node:test'
import assert from 'node:assert/strict'
import { extractMeanFromStatisticalResponse } from './cdse.ts'

test('extracts mean from Sentinel Hub Statistical API response shape', () => {
  const response = {
    data: [
      {
        outputs: {
          ndvi: {
            bands: {
              B0: {
                stats: { mean: 0.2147 },
              },
            },
          },
        },
      },
    ],
  }

  assert.equal(extractMeanFromStatisticalResponse(response, 'ndvi'), 0.2147)
})
