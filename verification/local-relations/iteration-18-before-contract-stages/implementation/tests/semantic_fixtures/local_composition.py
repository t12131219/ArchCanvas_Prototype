"""Original regressions for source patterns found in the read-only corpus."""
import torch
from torch import nn


def make_conv(a, b, stride=1):
    """A constructor factory which can be understood without executing Python."""
    return nn.Conv2d(a, b, 3, stride=stride, padding=1)


def dynamic_factory(a, b):
    print('must never execute')
    return nn.Conv2d(a, b, 3)


class Fragment(nn.Module):
    def __init__(self, width=8):
        super().__init__()
        self.projection = nn.Linear(width, width)

    def forward(self, x):
        return torch.sigmoid(self.projection(x)) * x


class NestedPipeline(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(nn.Linear(8, 8), Fragment(), nn.Sequential(nn.Tanh(), nn.Linear(8, 8)))

    def forward(self, x):
        return self.layers(x).view(x.size(0), -1)[:, -1:]


class FactoryPipeline(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = make_conv(3, 8)
        self.bn = nn.BatchNorm2d(8)
        self.act = nn.LeakyReLU()
        self.unknown = dynamic_factory(8, 8)

    def forward(self, x):
        return self.unknown(self.act(self.bn(self.conv(x))))


class ExplicitForward(nn.Module):
    def __init__(self):
        super().__init__()
        self.fragment = Fragment()

    def forward(self, x):
        return self.fragment.forward(x)


class OverloadedMaximum(nn.Module):
    def forward(self, x, y):
        return torch.max(x, y)


class NestedState(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.LSTM(8, 8)

    def forward(self, x):
        sequence, (hidden, memory) = self.cell(x)
        return {'sequence': sequence, 'hidden': hidden, 'memory': memory}


class ReadOnlyControl(nn.Module):
    def forward(self, x, count, flag):
        if flag:
            self.training
            x.shape
        for i in range(count):
            x.dtype
        return x


class WrittenControl(nn.Module):
    def forward(self, x, count, flag):
        if flag:
            y = x.relu()
            self.training
        else:
            y = x.tanh()
        for i in range(count):
            y = y + x
            x.shape
        return y


class VersionedReads(nn.Module):
    def forward(self, x):
        before = x.shape
        x = x.relu()
        after = x.shape
        annotation_only: int
        return before, after


class MergedReads(nn.Module):
    def forward(self, x, flag, count):
        before = x.shape
        if flag:
            x = x.relu()
        after_branch = x.shape
        for i in range(count):
            x = x.tanh()
        after_loop = x.shape
        return before, after_branch, after_loop


class DirectMutation(nn.Module):
    def forward(self, x, mask):
        alias = x
        before = x.shape
        alias.masked_fill_(mask, 0)
        after = x.shape
        return x, alias, before, after


class IndexedMutation(nn.Module):
    def forward(self, x, value, index, flag, count):
        alias = x
        if flag:
            x[:, index] = value
        for i in range(count):
            x[i] = value
        return x, alias


class ReboundModule(nn.Module):
    def __init__(self):
        super().__init__()
        self.layer = nn.Linear(8, 8)

    def forward(self, x, replacement, flag):
        observed = self.layer
        first = self.layer(x)
        if flag:
            self.layer = replacement
        second = self.layer(x)
        self.layer = replacement
        third = self.layer.forward(x)
        return first, second, third


class InplaceActivation(nn.Module):
    def __init__(self):
        super().__init__()
        self.act = nn.ReLU(inplace=True)

    def forward(self, x):
        alias = x
        self.act(x)
        return x, alias


class AugmentedMutation(nn.Module):
    def forward(self, x, y):
        alias = x
        x += y
        return x, alias


class ChainedMutation(nn.Module):
    def forward(self, x, mask):
        x.view(-1).masked_fill_(mask, 0)
        return x


class ReboundTensorState(nn.Module):
    def forward(self, x):
        self.value = x
        return self.value.unsqueeze(0)


class SequentialMutation(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(nn.ReLU(inplace=True), nn.Linear(8, 8))

    def forward(self, x):
        return self.layers(x) + x


class UnfamiliarBranches(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.Linear(8, 8)
        self.middle = Fragment()
        self.right = nn.Linear(8, 8)
        self.fuse = nn.Linear(24, 8)

    def forward(self, x):
        a = torch.tanh(self.left(x))
        b = self.middle(x).tanh()
        c = unfamiliar_kernel(self.right(x))
        return self.fuse(torch.cat((a, b, c), dim=-1))


class BranchMosaic(nn.Module):
    def __init__(self):
        super().__init__()
        self.front = nn.TransformerEncoderLayer(8, 2, batch_first=True)
        self.fragment = Fragment()
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.branches = UnfamiliarBranches()

    def forward(self, x):
        encoded = self.front(x)
        gated = self.fragment(encoded)
        sequence, hidden = self.sequence(gated)
        return self.branches(sequence), hidden


class StraightHead(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 16)
        self.b = nn.Linear(16, 8)
        self.drop = nn.Dropout(0.1)

    def forward(self, x):
        return self.drop(self.b(torch.relu(self.a(x))))


class HeadWithSideWork(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 16)
        self.b = nn.Linear(16, 8)

    def forward(self, x):
        torch.tanh(x)
        return self.b(torch.relu(self.a(x)))


class WideBranches(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.fuse = nn.Linear(64, 8)

    def forward(self, x):
        a = torch.tanh(self.project(x))
        b = torch.relu(self.project(x))
        c = torch.sigmoid(self.project(x))
        d = torch.sin(self.project(x))
        e = torch.cos(self.project(x))
        f = torch.abs(self.project(x))
        g = unfamiliar_kernel(self.project(x))
        h = another_kernel(self.project(x))
        return self.fuse(torch.cat((a, b, c, d, e, f, g, h), dim=-1))


class WovenFusion(nn.Module):
    """Original shared-result DAG; parsed statically, never imported."""

    def __init__(self):
        super().__init__()
        self.p0 = nn.Linear(8, 8)
        self.p1 = nn.Linear(8, 8)
        self.p2 = nn.Linear(8, 8)
        self.q0 = nn.Linear(8, 8)
        self.q1 = nn.Linear(8, 8)
        self.q2 = nn.Linear(8, 8)

    def forward(self, x):
        a0 = self.p0(x)
        a1 = self.p1(x)
        a2 = self.p2(x)
        b0 = torch.tanh(a0 + a1)
        b1 = torch.relu(a1 + a2)
        b2 = unfamiliar_kernel(a2 + a0)
        c0 = self.q0(b0 + b1)
        c1 = self.q1(b1 + b2)
        c2 = self.q2(b2 + b0)
        return torch.cat((c0, c1, c2), dim=-1)


class ScopedConvolution(nn.Module):
    """Recognizable work inside control scopes must not erase those scopes."""
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(8, 8, 3, padding=1)

    def forward(self, x, count, flag):
        for i in range(count):
            x = torch.relu(self.conv(x))
        if flag:
            x = torch.relu(self.conv(x))
        return x
