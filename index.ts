import * as pathlib from 'path';
import { Stack, Duration, CustomResource } from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

const cdkTaintEffectToK8sTaintEffect = (taintEffect: eks.TaintEffect | undefined): string | undefined => {
    if (typeof taintEffect === 'undefined') {
        return undefined;
    }

    switch (taintEffect) {
        case eks.TaintEffect.NO_SCHEDULE:
            return 'NoSchedule';
        case eks.TaintEffect.PREFER_NO_SCHEDULE:
            return 'PreferNoSchedule';
        case eks.TaintEffect.NO_EXECUTE:
            return 'NoExecute';
    }
    // Expect this to be unreachable
};

interface NodegroupAsgTagsProps {
    cluster: eks.ICluster;
    nodegroup: eks.INodegroup;
    nodegroupProps?: eks.NodegroupOptions;
    setClusterAutoscalerTagsForNodeLabels?: boolean;
    setClusterAutoscalerTagsForNodeTaints?: boolean;
    tags?: Record<string, string>;
}

const providerId = 'com.isotoma.cdk.custom-resources.nodegroup-asg-tags';

class NodegroupAsgTagsProvider extends Construct {
    public readonly provider: customResources.Provider;

    public static getOrCreate(scope: Construct): customResources.Provider {
        const stack = Stack.of(scope);
        const x = (stack.node.tryFindChild(providerId) as NodegroupAsgTagsProvider) || new NodegroupAsgTagsProvider(stack, providerId);
        return x.provider;
    }

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const handler = new lambda.Function(this, 'Handler', {
            code: lambda.Code.fromAsset(pathlib.join(__dirname, 'provider')),
            runtime: new lambda.Runtime('nodejs22.x', lambda.RuntimeFamily.NODEJS),
            handler: 'index.onEvent',
            timeout: Duration.seconds(30),
        });

        handler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['eks:DescribeNodegroup'],
                resources: ['*'],
            }),
        );
        handler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['autoscaling:CreateOrUpdateTags', 'autoscaling:DeleteTags'],
                resources: ['*'],
            }),
        );

        this.provider = new customResources.Provider(this, 'Provider', {
            onEventHandler: handler,
        });
    }
}

export class NodegroupAsgTags extends Construct {
    public readonly extraTags: Record<string, string>;

    constructor(scope: Construct, id: string, props: NodegroupAsgTagsProps) {
        super(scope, id);

        // See https://github.com/aws/aws-cdk/issues/22442
        const nodegroupName = (props.nodegroup.node.defaultChild as eks.CfnNodegroup).attrNodegroupName;

        const extraTags: Record<string, string> = props.tags ?? {};

        if (props.setClusterAutoscalerTagsForNodeLabels) {
            if (!props.nodegroupProps) {
                throw new Error('Must pass nodegroupProps if setClusterAutoscalerTagsForNodeLabels is true');
            }
            for (const [labelName, labelValue] of Object.entries(props.nodegroupProps.labels ?? {})) {
                extraTags[`k8s.io/cluster-autoscaler/node-template/label/${labelName}`] = labelValue;
            }
        }

        if (props.setClusterAutoscalerTagsForNodeTaints) {
            if (!props.nodegroupProps) {
                throw new Error('Must pass nodegroupProps if setClusterAutoscalerTagsForNodeTaints is true');
            }
            for (const taint of props.nodegroupProps.taints ?? []) {
                extraTags[`k8s.io/cluster-autoscaler/node-template/taint/${taint.key}`] = `${taint.value}:${cdkTaintEffectToK8sTaintEffect(taint.effect)}`;
            }
        }

        const provider = NodegroupAsgTagsProvider.getOrCreate(this);

        new CustomResource(this, 'Resource', {
            serviceToken: provider.serviceToken,
            resourceType: 'Custom::NodegroupAsgTags',
            properties: {
                NodegroupName: nodegroupName,
                ClusterName: props.cluster.clusterName,
                TagsJson: JSON.stringify(extraTags),
            },
        });

        this.extraTags = extraTags;
    }
}
