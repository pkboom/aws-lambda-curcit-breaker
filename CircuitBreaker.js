import axios from 'axios'
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient()
const circuitBreakerTable = process.env.CIRCUITBREAKER_TABLE
const lambdaFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME
const STATES = {
  OPEN: 'open',
  CLOSED: 'closed',
  HALF: 'half',
}

class CircuitBreaker {
  constructor(request, options) {
    Object.assign(this, this.default(request), options)
  }

  default(request) {
    return {
      request: request,
      state: STATES.CLOSED,
      failureCount: 0,
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 5000,
      nextAttempt: Date.now(),
    }
  }

  async fire() {
    let data = await this.getState()
    let itemData = data.Item

    Object.assign(this, itemData)

    if (this.state === STATES.OPEN) {
      if (this.canAttempt()) {
        this.state = STATES.HALF
      } else {
        throw new Error('Circuit is open. Please try again later.')
      }
    }

    try {
      let response = await axios(this.request)

      return await this.success(response)
    } catch (err) {
      return this.fail(err.message)
    }
  }

  canAttempt() {
    return this.nextAttempt <= Date.now()
  }

  async fail(error) {
    this.log()

    this.failureCount++

    if (this.state === STATES.HALF || this.failureCount >= this.failureThreshold) {
      this.state = STATES.OPEN

      this.nextAttempt = Date.now() + this.timeout
    }

    await this.updateState()

    return error
  }

  async getState() {
    try {
      let input = {
        TableName: circuitBreakerTable,
        Key: {
          id: lambdaFunctionName,
        },
      }

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/GetItemCommand/
      let command = new GetItemCommand(input)

      let response = await client.send(command)

      return response
    } catch (err) {
      console.error(err)
    }
  }

  log() {
    console.log(`State: ${this.state}`)
  }

  close() {
    this.successCount = 0
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  async success(response) {
    this.log()

    if (this.state === STATES.HALF) {
      this.successCount++

      if (this.successCount > this.successThreshold) {
        this.successCount = 0

        this.state = 'CLOSED'
      }
    }

    this.failureCount = 0

    await this.updateState()

    return response
  }

  async updateState() {
    try {
      let input = {
        TableName: circuitBreakerTable,
        Key: {
          id: lambdaFunctionName,
        },
        UpdateExpression:
          'set circuitState=:st, failureCount=:fc, successCount=:sc, nextAttempt=:na, stateTimestamp=:ts',
        ExpressionAttributeValues: {
          ':st': this.state,
          ':fc': this.failureCount,
          ':sc': this.successCount,
          ':na': this.nextAttempt,
          ':ts': Date.now(),
        },
        ReturnValues: 'UPDATED_NEW',
      }

      let response = await client.send(new UpdateItemCommand(input))

      return response
    } catch (err) {
      console.error(err)
    }
  }
}

export default CircuitBreaker
