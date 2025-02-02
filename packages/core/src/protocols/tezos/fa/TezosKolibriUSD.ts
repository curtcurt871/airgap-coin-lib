import { TezosProtocolNetwork } from '../TezosProtocolOptions'
import { TezosUtils } from '../TezosUtils'

import { TezosFA12Protocol } from './TezosFA12Protocol'
import { TezosFAProtocolOptions, TezosKolibriUSDProtocolConfig } from './TezosFAProtocolOptions'

export class TezosKolibriUSD extends TezosFA12Protocol {
  private static extractValueRegex = /}\s([0-9]+)$/

  constructor(
    public readonly options: TezosFAProtocolOptions = new TezosFAProtocolOptions(
      new TezosProtocolNetwork(),
      new TezosKolibriUSDProtocolConfig()
    )
  ) {
    super(options)
  }

  public async fetchTokenHolders(): Promise<{ address: string; amount: string }[]> {
    const request = {
      bigMapID: 380
    }
    const values = await this.contract.bigMapValues(request)
    return values
      .map((value) => {
        try {
          const address = TezosUtils.parseAddress(value.key)
          if (address === undefined || !value.value) {
            return {
              address: '',
              amount: '0'
            }
          }
          let amount = '0'

          const match = TezosKolibriUSD.extractValueRegex.exec(value.value as string)
          if (match) {
            amount = match[1]
          }

          return {
            address: address,
            amount
          }
        } catch {
          return {
            address: '',
            amount: '0'
          }
        }
      })
      .filter((value) => value.amount !== '0')
  }
}
