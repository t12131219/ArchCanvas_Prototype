"""Source-only fixtures: local output paths do not require a model family."""
import torch
from torch import nn


class BranchWork(nn.Module):
    def forward(self, x):
        a = torch.sin(x)
        b = torch.cos(a)
        c = torch.tanh(b)
        d = torch.relu(c)
        e = torch.sigmoid(d)
        f = torch.sin(e)
        g = torch.cos(f)
        h = torch.tanh(g)
        return h + a


class DeepWork(nn.Module):
    def forward(self, x, context):
        a = torch.sin(x)
        b = torch.cos(a)
        c = torch.tanh(b)
        d = torch.relu(c)
        e = torch.sigmoid(d)
        f = torch.sin(e)
        g = torch.cos(f)
        h = torch.tanh(g)
        i = torch.relu(h)
        j = torch.sigmoid(i)
        return j + a + context


class OutletWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y):
        context = self.prepare(x)
        value = self.combine(y, context)
        return self.finish(value)


class UnknownOutlet(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y):
        context = self.prepare(x)
        value = self.combine(y, context)
        return foreign_finish(value)


class JoinedOutlets(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y):
        context = self.prepare(x)
        value = self.combine(y, context)
        return value + context


class ConditionalOutlet(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y, flag):
        context = self.prepare(x)
        value = self.combine(y, context)
        if flag:
            return self.finish(value)
        return value


class StatefulOutlet(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x, y, previous):
        context = self.prepare(x)
        value = self.combine(y, context)
        return self.cell(value, previous)


class SharedOutlets(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y):
        first = self.prepare(x)
        second = self.prepare(y)
        return first + second


class MutableOutlet(nn.Module):
    def __init__(self):
        super().__init__()
        self.prepare = BranchWork()
        self.combine = DeepWork()
        self.finish = nn.Linear(4, 4)

    def forward(self, x, y):
        context = self.prepare(x)
        value = self.combine(y, context)
        value.add_(context)
        return value
