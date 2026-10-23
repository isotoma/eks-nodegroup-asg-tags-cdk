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

## Releasing a new version

- Be on latest main, with no unpublished changes
- Run `npm version (patch|minor|major)` as appropriate
- Run `git push` and `git push origin TAG` where `TAG` is the tag that `npm version` just created

The tag triggers a GitHub Actions job that stages the release on npm.

### Approving the release

Pushing the tag does not put anything in front of consumers. The workflow uses
[staged publishing](https://docs.npmjs.com/staged-publishing/): the version lands
in the registry but is not installable until a maintainer approves it with 2FA.

After the tag job goes green, approve it in the Staged Packages tab on npmjs.com,
or from the CLI:

```bash
npm stage list
npm stage approve <stage-id>
```

`npm stage reject` discards it instead. A staged version occupies its version
number, so to stage the same version again, reject the existing stage first.

### Authentication

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
over OIDC, so there is no `NPM_TOKEN` secret. The job requests `id-token: write`
and the npm CLI exchanges that for a short-lived token, which also generates
provenance attestations automatically.

The trust relationship is configured on npmjs.com under the package's settings,
naming the organisation, the repository, and the workflow filename
(`publish.yaml`). Existing configurations cannot be edited, only deleted and
recreated.

Staged publishing needs npm 11.15.0 or later, above what Node 24 bundles, so the
workflow installs npm explicitly and asserts the version. Below that floor the
CLI falls back to token authentication and fails with a misleading `E404`.

OIDC covers `npm publish` and `npm stage publish` only. The approve, reject, list
and view subcommands need interactive authentication and cannot use it.
