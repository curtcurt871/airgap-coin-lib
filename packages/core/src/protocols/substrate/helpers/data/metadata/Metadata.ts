import { InvalidValueError, UnsupportedError } from '../../../../../errors'
import { Domain } from '../../../../../errors/coinlib-error'
import { SubstrateNetwork } from '../../../SubstrateNetwork'
import { SCALEDecoder } from '../scale/SCALEDecoder'

import { MetadataDecorator } from './decorator/MetadataDecorator'
import { MetadataVersioned } from './MetadataVersioned'
import { MetadataV11 } from './v11/MetadataV11'
import { MetadataV12 } from './v12/MetadataV12'

const MAGIC_NUMBER = '6174656d' // `meta` in hex

export class Metadata {
  public static decode(network: SubstrateNetwork, runtimeVersion: number | undefined, raw: string): Metadata {
    const decoder = new SCALEDecoder(network, runtimeVersion, raw)

    const magicNumber = decoder.decodeNextInt(32) // 32 bits
    this.assertMagicNumber(magicNumber.decoded.toNumber())

    const version = decoder.decodeNextInt(8) // 8 bits

    let versioned: MetadataVersioned
    switch (version.decoded.toNumber()) {
      case 12:
        versioned = MetadataV12.decode(network, runtimeVersion, raw)
        break
      case 11:
        versioned = MetadataV11.decode(network, runtimeVersion, raw)
        break
      default:
        throw new UnsupportedError(Domain.SUBSTRATE, `Error while parsing metadata, metadata version ${version} is not supported`)
    }

    return new Metadata(versioned)
  }

  private static assertMagicNumber(magicNumber: number) {
    if (magicNumber !== parseInt(MAGIC_NUMBER, 16)) {
      throw new InvalidValueError(Domain.SUBSTRATE, 'Error while parsing metadata, invalid magic number')
    }
  }

  private constructor(readonly versioned: MetadataVersioned) {}

  public decorate(): MetadataDecorator {
    return this.versioned.decorate()
  }
}
