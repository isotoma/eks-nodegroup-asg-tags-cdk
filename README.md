# eks-nodegroup-asg-tags-cdk

To apply tags to the ASG for an EKS nodegroup, in particular for
signalling labels and taints to to the cluster autoscaler.

See https://github.com/kubernetes/autoscaler/issues/3780

This custom resource finds the ASG for a given EKS nodegroup and
applies tags to the associated ASG. The Kubernetes cluster autoscaler
can see tags on the ASG, and can use these to know what instance it
will get if it scales up that ASG. This usually is irrelevant, as the
cluster autoscaler will look at the existing nodes and assume any new
node it creates will be the same. However, this breaks down if a
Nodegroup/ASG can scale to zero. In this situations, it depends on
whether the running cluster autoscaler has previously seen nodes from
that ASG or not, which is not robust, and the cluster may enter a
state where a pod is unschedulable, there is an ASG that - if scaled
up - would provide a node able to run the pod, but the cluster
autoscaler doesn't know that, so won't scale up.

## Example

```typescript
import { NodegroupAsgTags } from 'eks-nodegroup-asg-tags-cdk';

// ...

const myCluster = ...
const myNodegroupProps = {...};
const myNodegroup = myCluster.addNodegroupCapacity(..., myNodegroupProps);

new NodegroupAsgTags(this, 'MyNodegroupTags', {
    cluster: props.cluster,
    nodegroup: myNodegroup,
    nodegroupProps,
    setClusterAutoscalerTagsForNodeLabels: true,
    setClusterAutoscalerTagsForNodeTaints: true,
    tags: {
        'k8s.io/cluster-autoscaler/node-template/autoscaling-options/scaledownunneededtime': '1m0s',
    },
});
```

Note: using `NodegroupAsgTags` only tags the ASG. You can confuse the
cluster autoscaler by setting a tag claiming the nodes for that ASG
behave in one way when really they don't.

## Properties

- `cluster` (type: `eks.ICluster`, required): the EKS cluster
- `nodegroup` (type: `eks.INodegroup`, required): the EKS Nodegroup
- `nodegroupProps` (type: `eks.NodegroupOptions`, required if
  `setClusterAutoscalerTagsForNodeLabels` or
  `setClusterAutoscalerTagsForNodeTaints` is `true`): if either of the
  `setClusterAutoscalerTags*` options is set to `true`, this is
  required and the tags that the cluster autoscaler understands are
  applied from the props passed to the nodegroup. (It's an annoying
  limit of the CDK that these aren't available from the nodegroup,
  hence why the nodegroup props need to be passed here)
- `setClusterAutoscalerTagsForNodeLabels` (type: `boolean`, optional):
  if set, must set `nodegroupProps`, and then applies tags like
  `k8s.io/cluster-autoscaler/node-template/label/${labelName}:
  ${labelValue}`.
- `setClusterAutoscalerTagsForNodeTaints` (type: `boolean`, optional):
  if set, must set `nodegroupProps`, and then applies tags like
  `k8s.io/cluster-autoscaler/node-template/taint/${taintName}:
  ${taintValue}`.
- `tags` (type: `Record<string, string>`, optional): any other tags to
  set on the ASG.
