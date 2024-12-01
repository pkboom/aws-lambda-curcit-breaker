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

    Object.assign(this, data.Item)

    if (this.open()) {
      if (this.canAttempt()) {
        this.state = STATES.HALF
      } else {
        throw new Error('Circuit is open.')
      }
    }

    try {
      let response = await axios(this.request)

      await this.success()

      return response
    } catch (error) {
      this.fail()

      throw error
    }
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

  canAttempt() {
    return this.nextAttempt <= Date.now()
  }

  open() {
    return this.state === STATES.OPEN
  }

  async success() {
    this.log()

    if (this.half() && this.successCount++ > this.successThreshold) {
      this.successCount = 0

      this.state = STATES.CLOSED
    }

    this.failureCount = 0

    await this.updateState()
  }

  async fail() {
    this.log()

    if (this.half() || this.failureCount++ > this.failureThreshold) {
      this.state = STATES.OPEN

      this.nextAttempt = Date.now() + this.timeout
    }

    await this.updateState()
  }

  half() {
    return this.state === STATES.HALF
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

      await client.send(new UpdateItemCommand(input))
    } catch (error) {
      throw error
    }
  }

  log() {
    console.log(`State: ${this.state}`)
  }
}

export default CircuitBreaker
