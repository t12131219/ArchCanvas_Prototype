"""Local dependencies mixed without assuming a complete model family; static only."""
import torch
from torch import nn


def curve(x):
    a = torch.sin(x)
    b = torch.cos(a)
    c = torch.tanh(b)
    d = torch.sigmoid(c)
    return torch.sin(d)


class RelayWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)

    def relay(self, x, context):
        a = self.project(curve(x))
        b = self.project(context)
        weight = torch.sigmoid(a)
        selected, indices = torch.topk(weight * b, 2)
        unresolved = unfinished_route(selected, indices)
        return torch.cos(unresolved) + a

    def forward(self, x, context):
        return torch.tanh(self.relay(x, context))


class BrokenRelayWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)

    def relay(self, x, context):
        a = self.project(curve(x))
        b = self.project(context)
        weight = unfinished_weight(a)
        selected, indices = torch.topk(weight * b, 2)
        unresolved = unfinished_route(selected, indices)
        return torch.cos(unresolved) + a

    def forward(self, x, context):
        return torch.tanh(self.relay(x, context))


class GuardedRelayWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)

    def relay(self, x, context, flag=True):
        a = self.project(curve(x))
        if flag:
            b = self.project(context)
            value = torch.sigmoid(a) * b
        else:
            value = unfinished_route(a, context)
        return torch.cos(value) + a

    def forward(self, x, context, flag):
        return torch.tanh(self.relay(x, context, flag))
