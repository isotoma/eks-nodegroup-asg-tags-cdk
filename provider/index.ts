import * as AWS from 'aws-sdk';
import * as utils from './utils';

interface ResourceProperties {
    NodegroupName: string;
    ClusterName: string;
    TagsJson: string;
}

const decodeResourceProperties = (resourceProperties: unknown): ResourceProperties => {
    return {
        NodegroupName: utils.getStringKeyOrError('NodegroupName', resourceProperties, 'Invalid resourceProperties'),
        ClusterName: utils.getStringKeyOrError('ClusterName', resourceProperties, 'Invalid resourceProperties'),
        TagsJson: utils.getStringKeyOrError('TagsJson', resourceProperties, 'Invalid resourceProperties'),
    };
};

const decodeEvent = (event: unknown): utils.Event<ResourceProperties> => {
    const requestType = utils.getStringKeyOrError('RequestType', event, 'Invalid event');
    switch (requestType) {
        case 'Create':
            return {
                RequestType: utils.RequestType.Create,
                ResourceProperties: decodeResourceProperties(utils.getUntypedKeyOrError('ResourceProperties', event, 'Invalid create event')),
            };
        case 'Update':
            return {
                RequestType: utils.RequestType.Update,
                PhysicalResourceId: utils.getStringKeyOrError('PhysicalResourceId', event, 'Invalid update event'),
                ResourceProperties: decodeResourceProperties(utils.getUntypedKeyOrError('ResourceProperties', event, 'Invalid update event')),
                OldResourceProperties: decodeResourceProperties(utils.getUntypedKeyOrError('OldResourceProperties', event, 'Invalid update event')),
            };
        case 'Delete':
            return {
                RequestType: utils.RequestType.Delete,
                PhysicalResourceId: utils.getStringKeyOrError('PhysicalResourceId', event, 'Invalid delete event'),
                ResourceProperties: decodeResourceProperties(utils.getUntypedKeyOrError('ResourceProperties', event, 'Invalid update event')),
            };
    }
    throw new Error(`Unknown event type: ${requestType}`);
};

type Tags = Record<string, string>;

const loadTags = (tagsJson: string): Tags => {
    const obj: unknown = JSON.parse(tagsJson);
    if (typeof obj !== 'object' || !obj) {
        throw new Error('Unable to parse TagsJson');
    }

    const tags: Tags = {};

    for (const [key, value] of Object.entries(obj)) {
        if (utils.isString(key) && utils.isString(value)) {
            tags[key] = value;
        }
    }

    return tags;
};

const findAsgName = async (clusterName: string, nodegroupName: string): Promise<string> => {
    const eks = new AWS.EKS();

    const describeNodegroupResponse = await eks
        .describeNodegroup({
            clusterName,
            nodegroupName,
        })
        .promise();

    const asgName = describeNodegroupResponse.nodegroup?.resources?.autoScalingGroups?.[0]?.name;

    if (typeof asgName === 'string') {
        return asgName;
    }

    throw new Error(`Unable to determine ASG name for nodegroup ${nodegroupName} in cluster ${clusterName}`);
};

const tagAsg = async (asgName: string, tags: Tags): Promise<void> => {
    const autoScaling = new AWS.AutoScaling();

    const tagsToApply = [];

    for (const [key, value] of Object.entries(tags)) {
        tagsToApply.push({
            Key: key,
            Value: value,
            PropagateAtLaunch: true,
            ResourceId: asgName,
            ResourceType: 'auto-scaling-group',
        });
    }

    if (tagsToApply.length === 0) {
        return;
    }

    await autoScaling
        .createOrUpdateTags({
            Tags: tagsToApply,
        })
        .promise();
};

const untagAsg = async (asgName: string, tagKeys: Array<string>): Promise<void> => {
    const autoScaling = new AWS.AutoScaling();

    const tagsToDelete = [];

    for (const key of tagKeys) {
        tagsToDelete.push({
            Key: key,
            // Value: '',
            // PropagateAtLaunch: true,
            ResourceId: asgName,
            ResourceType: 'auto-scaling-group',
        });
    }

    if (tagsToDelete.length === 0) {
        return;
    }

    await autoScaling
        .deleteTags({
            Tags: tagsToDelete,
        })
        .promise();
};

const handleCreate = async (event: utils.CreateEvent<ResourceProperties>): Promise<utils.Response> => {
    const tags = loadTags(event.ResourceProperties.TagsJson);
    const asgName = await findAsgName(event.ResourceProperties.ClusterName, event.ResourceProperties.NodegroupName);

    utils.log('Tagging ASG', { asgName, tags });
    await tagAsg(asgName, tags);

    return {
        PhysicalResourceId: `${asgName}:tags`,
        Data: {},
    };
};

const handleUpdate = async (event: utils.UpdateEvent<ResourceProperties>): Promise<utils.Response> => {
    const tags = loadTags(event.ResourceProperties.TagsJson);
    const oldTags = loadTags(event.OldResourceProperties.TagsJson);
    const asgName = await findAsgName(event.ResourceProperties.ClusterName, event.ResourceProperties.NodegroupName);

    utils.log('Tagging ASG', { asgName, tags });
    await tagAsg(asgName, tags);

    const tagKeysToRemove = Object.keys(oldTags).filter((key: string): boolean => !Object.keys(tags).includes(key));
    utils.log('Untagging ASG', { asgName, tagKeysToRemove });
    await untagAsg(asgName, tagKeysToRemove);

    return {
        PhysicalResourceId: `${asgName}:tags`,
        Data: {},
    };
};

const handleDelete = async (event: utils.DeleteEvent<ResourceProperties>): Promise<utils.Response> => {
    const tags = loadTags(event.ResourceProperties.TagsJson);
    const asgName = await findAsgName(event.ResourceProperties.ClusterName, event.ResourceProperties.NodegroupName);
    const tagKeysToRemove = Object.keys(tags);

    utils.log('Untagging ASG', { asgName, tagKeysToRemove });
    await untagAsg(asgName, tagKeysToRemove);

    return {
        PhysicalResourceId: event.PhysicalResourceId,
        Data: {},
    };
};

const handleEvent = async (inputEvent: unknown): Promise<utils.Response> => {
    utils.log('Handling event', { event: inputEvent });
    const event = decodeEvent(inputEvent);
    switch (event.RequestType) {
        case utils.RequestType.Create:
            return handleCreate(event);
        case utils.RequestType.Update:
            return handleUpdate(event);
        case utils.RequestType.Delete:
            return handleDelete(event);
    }
};

export const onEvent = (inputEvent: unknown): Promise<utils.Response> => {
    return handleEvent(inputEvent).catch((err) => {
        utils.logError(err, 'Unhandled error, failing');
        return Promise.reject(new Error('Failed'));
    });
};
